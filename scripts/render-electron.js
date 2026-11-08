const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({
      width: 512,
      height: 512,
      show: false,
      frame: false,
      transparent: true,
      webPreferences: {
        offscreen: true
      }
    });

    const svg = fs.readFileSync(path.resolve(__dirname, '../resources/icon.svg'), 'utf8');
    const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:transparent;overflow:hidden;"><div style="width:512px;height:512px;">${svg}</div></body></html>`;
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    await new Promise((r) => setTimeout(r, 300));

    const image = await win.capturePage({ x: 0, y: 0, width: 512, height: 512 });
    const png = image.toPNG();
    const outPng = path.resolve(__dirname, '../resources/icon.png');
    const outIco = path.resolve(__dirname, '../resources/icon.ico');

    fs.writeFileSync(outPng, png);
    console.log('High-res PNG written via Electron! Size:', png.length, 'bytes');

    // Build ICO
    const header = Buffer.alloc(22);
    header.writeUInt16LE(0, 0); // reserved
    header.writeUInt16LE(1, 2); // icon type (1 = ICO)
    header.writeUInt16LE(1, 4); // count of images
    header.writeUInt8(0, 6); // width (0 = 256)
    header.writeUInt8(0, 7); // height (0 = 256)
    header.writeUInt8(0, 8); // color count
    header.writeUInt8(0, 9); // reserved
    header.writeUInt16LE(1, 10); // planes
    header.writeUInt16LE(32, 12); // bit depth
    header.writeUInt32LE(png.length, 14); // image size
    header.writeUInt32LE(22, 18); // offset where image data starts
    const ico = Buffer.concat([header, png]);
    fs.writeFileSync(outIco, ico);
    console.log('High-res ICO written! Size:', ico.length, 'bytes');
  } catch (err) {
    console.error('Error rendering icon in electron:', err);
  } finally {
    app.quit();
  }
});
