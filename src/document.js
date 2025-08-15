// Document & Layer models
export class Layer {
  constructor(w, h, name = 'Layer') {
    this.name = name;
    this.visible = true;
    this.opacity = 1;
    this.blend = 'source-over';
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d');
  }
  clone() {
    const l = new Layer(this.canvas.width, this.canvas.height, this.name);
    l.visible = this.visible;
    l.opacity = this.opacity;
    l.blend = this.blend;
    l.ctx.drawImage(this.canvas, 0, 0);
    return l;
  }
  toData() {
    return {
      name: this.name,
      visible: this.visible,
      opacity: this.opacity,
      blend: this.blend,
      src: this.canvas.toDataURL('image/png'),
    };
  }
  static async fromData(d) {
    const img = new Image();
    img.src = d.src;
    await img.decode();
    const l = new Layer(img.width, img.height, d.name || 'Layer');
    l.visible = d.visible !== false;
    l.opacity = d.opacity ?? 1;
    l.blend = d.blend || 'source-over';
    l.ctx.drawImage(img, 0, 0);
    return l;
  }
}

export class Doc {
  constructor(w = 1024, h = 768) {
    this.w = w;
    this.h = h;
    this.layers = [];
    this.active = 0;
  }
  addLayer(l) {
    this.layers.push(l);
    this.active = this.layers.length - 1;
  }
  activeLayer() {
    return this.layers[this.active];
  }
  toProject() {
    return {
      w: this.w,
      h: this.h,
      layers: this.layers.map((l) => l.toData()),
      active: this.active,
      meta: { app: 'PhotoPop', v: 1 },
    };
  }
  async fromProject(p) {
    this.w = p.w;
    this.h = p.h;
    this.layers = [];
    for (const d of p.layers) {
      this.layers.push(await Layer.fromData(d));
    }
    this.active = p.active || 0;
  }
}
