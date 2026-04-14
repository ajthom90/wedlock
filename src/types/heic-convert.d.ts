declare module 'heic-convert' {
  interface HeicConvertOptions {
    buffer: ArrayBufferLike;
    format: 'JPEG' | 'PNG';
    quality?: number;
  }
  function heicConvert(options: HeicConvertOptions): Promise<ArrayBuffer>;
  export = heicConvert;
}
