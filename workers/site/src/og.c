// og.c — the heavy half of the tray link-preview picture (see og.js), as WebAssembly.
//
// A fresh Worker runs JavaScript unoptimized, and drawing and compressing a 1200×630 picture
// that way costs more than the free plan's 10 ms of CPU. WebAssembly is compiled before the first
// request, so this runs at full speed every time.
//
// og.js works out everything about the picture from cubeface.js (the layout, each look's
// colors and light triangle) and writes it into params() and palette(). render() then builds
// every row as runs of one color, writes the PNG's compressed data straight from those runs
// (fixed-Huffman deflate: literals, references to the byte before and to the row above), and
// wraps it in a PNG. og.js's rows() is the reference for what each row should hold; the tests
// check the two agree pixel for pixel.
//
// Build: tools/build_og_wasm.sh (clang with the wasm32 target). No libc.

typedef unsigned char u8;
typedef unsigned int u32;
typedef unsigned long long u64;

#define W 1200
#define H 630
#define ROW (W + 1)
#define LEVELS 16
#define LOOK 23 // ints per look: base, light, hasTri, b, c, side, steps[LEVELS + 1]

// params(): 0 w, 1 h, 2 s, 3 m, 4 gap, 5 pad, 6 tx, 7 tw, 8 ty, 9 th, 10 bg, 11 tray,
// 12 band height, 13 colors, 14–21 the band as [value, length] × 4,
// 32… 12 looks × LOOK, then the grid (up to 100 looks, row by row).
#define P_LOOKS 32
#define P_GRID (P_LOOKS + 12 * LOOK)
static int P[P_GRID + 100];
static u8 PAL[3 * 256];
static u8 OUT[1 << 19];

__attribute__((export_name("params"))) int *params(void) { return P; }
__attribute__((export_name("palette"))) u8 *palette(void) { return PAL; }
__attribute__((export_name("png"))) u8 *png(void) { return OUT; }

// --- Tables ----------------------------------------------------------------------------------

static u32 LIT_CODE[288], LIT_LEN[288];
static u32 LEN_VAL[259], LEN_BITS[259];
static u32 D1_VAL, D1_BITS, DROW_VAL, DROW_BITS;
static u32 CRC[256];
static int ready = 0;

static u32 reverse(u32 code, int len) {
  u32 r = 0;
  for (int i = 0; i < len; i++) { r = (r << 1) | (code & 1); code >>= 1; }
  return r;
}

static void distance(int d, u32 *val, u32 *bits) {
  static const int BASE[30] = {1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769,
                               1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577};
  int i = 29;
  while (BASE[i] > d) i--;
  int extra = i < 4 ? 0 : (i >> 1) - 1;
  *val = reverse(i, 5) | ((u32)(d - BASE[i]) << 5);
  *bits = 5 + extra;
}

static void init(void) {
  for (int s = 0; s < 288; s++) {
    u32 base, len, first;
    if (s < 144) { base = 0x30; len = 8; first = 0; }
    else if (s < 256) { base = 0x190; len = 9; first = 144; }
    else if (s < 280) { base = 0; len = 7; first = 256; }
    else { base = 0xc0; len = 8; first = 280; }
    LIT_CODE[s] = reverse(base + s - first, len);
    LIT_LEN[s] = len;
  }
  static const int LB[29] = {3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258};
  static const int LE[29] = {0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0};
  for (int n = 3; n <= 258; n++) {
    int i = 28;
    while (LB[i] > n) i--;
    if (n == 258) i = 28; else if (i == 28) i = 27;
    LEN_VAL[n] = LIT_CODE[257 + i] | ((u32)(n - LB[i]) << LIT_LEN[257 + i]);
    LEN_BITS[n] = LIT_LEN[257 + i] + LE[i];
  }
  distance(1, &D1_VAL, &D1_BITS);
  distance(ROW, &DROW_VAL, &DROW_BITS);
  for (u32 n = 0; n < 256; n++) {
    u32 c = n;
    for (int k = 0; k < 8; k++) c = c & 1 ? 0xedb88320u ^ (c >> 1) : c >> 1;
    CRC[n] = c;
  }
  ready = 1;
}

// --- Rows ------------------------------------------------------------------------------------

static int run[512], prev[512], nrun, nprev;

static void push(int v, int n) {
  if (n <= 0) return;
  if (nrun && run[nrun - 2] == v) run[nrun - 1] += n;
  else { run[nrun++] = v; run[nrun++] = n; }
}

static double coverage(double d) {
  if (d >= 1) return 1;
  if (d <= -1) return 0;
  return d >= 0 ? 1 - (1 - d) * (1 - d) / 2 : (1 + d) * (1 + d) / 2;
}

static int imin(int a, int b) { return a < b ? a : b; }
static int imax(int a, int b) { return a > b ? a : b; }

static void build_row(int y) {
  const int w = P[0], h = P[1], s = P[2], m = P[3], gap = P[4], pad = P[5];
  const int tx = P[6], tw = P[7], ty = P[8], th = P[9], BG = P[10], TR = P[11], band = P[12];
  nrun = 0;
  if (y >= H - band) {
    for (int i = 0; i < 4; i++) push(P[14 + 2 * i], P[15 + 2 * i]);
    return;
  }
  if (y < ty || y >= ty + th) { push(BG, W); return; }
  push(BG, tx);
  int ry = y - ty - pad;
  int r = ry >= 0 ? ry / (s + gap) : -1;
  int fy = ry - r * (s + gap);
  if (ry < 0 || r >= h || fy >= s) {
    push(TR, tw);
  } else {
    push(TR, pad);
    for (int c = 0; c < w; c++) {
      if (c) push(TR, gap);
      const int *L = P + P_LOOKS + LOOK * P[P_GRID + r * w + c];
      const int B = L[0], light = L[1], tri = L[2], b = L[3], cu = L[4], side = L[5];
      const int *steps = L + 6;
      if (!tri || fy < m || fy >= s - m) { push(B, s); continue; }
      const int xa = m, xb = s - m;
      const double K = 0.5 + b * (fy + 0.5) - (double)cu * s;
      const int lo = imin(xb, imax(xa, (int)__builtin_floor(-1 - K)));
      const int hi = imax(lo - 1, imin(xb - 1, (int)__builtin_ceil(1 - K)));
      push(B, xa);
      push(side > 0 ? B : light, lo - xa);
      for (int x = lo; x <= hi; x++) push(steps[(int)__builtin_floor(coverage(side * (x + K)) * LEVELS + 0.5)], 1);
      push(side > 0 ? light : B, xb - 1 - hi);
      push(B, m);
    }
    push(TR, pad);
  }
  push(BG, W - tx - tw);
}

// --- Deflate and PNG -------------------------------------------------------------------------

static u64 acc;
static int nb, pos;

static inline void put(u32 value, u32 bits) {
  acc |= (u64)value << nb;
  nb += bits;
  while (nb >= 8) { OUT[pos++] = (u8)acc; acc >>= 8; nb -= 8; }
}

static int split(int left) { return left <= 258 ? left : left - 258 < 3 ? left - 3 : 258; }

static void put32(int at, u32 v) {
  OUT[at] = v >> 24; OUT[at + 1] = v >> 16; OUT[at + 2] = v >> 8; OUT[at + 3] = v;
}

static u32 crc(int from, int to) {
  u32 c = 0xffffffffu;
  for (int i = from; i < to; i++) c = CRC[(c ^ OUT[i]) & 255] ^ (c >> 8);
  return c ^ 0xffffffffu;
}

static void chunk_end(int start) { // start: where the chunk's length goes; data runs to pos
  put32(start, pos - start - 8);
  u32 c = crc(start + 4, pos);
  put32(pos, c);
  pos += 4;
}

static void chunk_start(const char *type) {
  pos += 4;
  for (int i = 0; i < 4; i++) OUT[pos++] = type[i];
}

/** Draws the picture described by params() and palette(). Returns the PNG's length in png(). */
__attribute__((export_name("render"))) int render(void) {
  if (!ready) init();
  static const u8 SIG[8] = {137, 80, 78, 71, 13, 10, 26, 10};
  pos = 0;
  for (int i = 0; i < 8; i++) OUT[pos++] = SIG[i];

  int at = pos;
  chunk_start("IHDR");
  put32(pos, W); put32(pos + 4, H); pos += 8;
  OUT[pos++] = 8; OUT[pos++] = 3; OUT[pos++] = 0; OUT[pos++] = 0; OUT[pos++] = 0; // 8-bit palette
  chunk_end(at);

  at = pos;
  chunk_start("PLTE");
  for (int i = 0; i < 3 * P[13]; i++) OUT[pos++] = PAL[i];
  chunk_end(at);

  at = pos;
  chunk_start("IDAT");
  acc = 0; nb = 0;
  put(0x78, 8); put(0x01, 8); // zlib: deflate, 32K window
  put(1, 1); put(1, 2);       // final block, fixed Huffman codes
  u64 A = 1, Bs = 0;          // Adler-32
  nprev = 0;
  for (int y = 0; y < H; y++) {
    build_row(y);
    int same = y > 0 && nrun == nprev;
    for (int i = 0; same && i < nrun; i++) same = run[i] == prev[i];
    if (same) {
      for (int left = ROW; left > 0;) {
        int n = split(left);
        put(LEN_VAL[n], LEN_BITS[n]);
        put(DROW_VAL, DROW_BITS);
        left -= n;
      }
    } else {
      put(LIT_CODE[0], LIT_LEN[0]); // filter byte: none
      for (int i = 0; i < nrun; i += 2) {
        const int v = run[i];
        put(LIT_CODE[v], LIT_LEN[v]);
        int left = run[i + 1] - 1;
        while (left >= 3) {
          int n = split(left);
          put(LEN_VAL[n], LEN_BITS[n]);
          put(D1_VAL, D1_BITS);
          left -= n;
        }
        for (; left > 0; left--) put(LIT_CODE[v], LIT_LEN[v]);
      }
    }
    // Adler-32, a run at a time: n bytes of v add n·v to A and n·A + v·n(n+1)/2 to B.
    Bs += A;
    for (int i = 0; i < nrun; i += 2) {
      u64 v = run[i], n = run[i + 1];
      Bs += n * A + v * (n * (n + 1) / 2);
      A += n * v;
    }
    A %= 65521; Bs %= 65521;
    for (int i = 0; i < nrun; i++) prev[i] = run[i];
    nprev = nrun;
  }
  put(LIT_CODE[256], LIT_LEN[256]); // end of block
  if (nb > 0) put(0, 8 - nb);
  put32(pos, (u32)((Bs << 16) | A)); pos += 4;
  chunk_end(at);

  at = pos;
  chunk_start("IEND");
  chunk_end(at);
  return pos;
}
