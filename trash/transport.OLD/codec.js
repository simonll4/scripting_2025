import { Transform } from "stream";

export class Deframer extends Transform {
  constructor(maxFrame = 262144) {
    super();
    this.buf = Buffer.alloc(0);
    this.max = maxFrame;
  }
  _transform(chunk, _enc, cb) {
    this.buf = Buffer.concat([this.buf, chunk]);
    while (this.buf.length >= 4) {
      const len = this.buf.readUInt32BE(0);
      if (len > this.max) {
        this.emit("error", new Error("FRAME_TOO_LARGE"));
        return;
      }
      if (this.buf.length < 4 + len) break;
      const payload = this.buf.slice(4, 4 + len);
      this.push(payload);
      this.buf = this.buf.slice(4 + len);
    }
    cb();
  }
}

export class Framer extends Transform {
  constructor() {
    super({ writableObjectMode: true });
  }
  _transform(obj, _enc, cb) {
    const json = Buffer.from(JSON.stringify(obj), "utf8");
    const hdr = Buffer.alloc(4);
    hdr.writeUInt32BE(json.length, 0);
    this.push(Buffer.concat([hdr, json]));
    cb();
  }
}
