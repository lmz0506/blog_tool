const fs = require("node:fs");
const path = require("node:path");

const rootPackagePath = path.join(__dirname, "..", "package.json");
const desktopPackagePath = path.join(__dirname, "..", "desktop", "package.json");

const rootPackage = JSON.parse(fs.readFileSync(rootPackagePath, "utf8"));
const desktopPackage = JSON.parse(fs.readFileSync(desktopPackagePath, "utf8"));

const nextDesktopPackage = {
  ...desktopPackage,
  version: rootPackage.version,
  author: rootPackage.author,
};

const nextText = `${JSON.stringify(nextDesktopPackage, null, 2)}\n`;
const currentText = fs.readFileSync(desktopPackagePath, "utf8");

if (currentText !== nextText) {
  fs.writeFileSync(desktopPackagePath, nextText, "utf8");
}
