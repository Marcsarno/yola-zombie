// node tools/hood/svg2png.cjs <in.svg> <out.png> <dir holding sharp's package (node_modules/sharp)>
const [, , inp, out, sharpDir] = process.argv;
require(require('path').join(sharpDir, 'sharp'))(inp).png().toFile(out).then((i) => console.log('png', i.width, i.height));
