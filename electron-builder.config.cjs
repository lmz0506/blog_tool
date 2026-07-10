const rootPackage = require("./package.json");

function resolveGitHubPublish() {
  const repository = process.env.GITHUB_REPOSITORY || process.env.BLOGTOOL_GITHUB_REPOSITORY || "";
  const [owner, repo] = repository.split("/");

  if (!owner || !repo) {
    return undefined;
  }

  return [
    {
      provider: "github",
      owner,
      repo,
      releaseType: "release",
      vPrefixedTagName: true,
    },
  ];
}

module.exports = {
  appId: "com.limverse.blogtool",
  productName: "BlogTool",
  asar: false,
  // 版本号以根 package.json 为唯一来源，桌面包版本滞后时不再产出错误版本号的安装包
  extraMetadata: {
    version: rootPackage.version,
  },
  // 只保留中英文语言包（默认携带 50+ 种 Chromium 语言包，约 47MB）
  electronLanguages: ["zh-CN", "en-US"],
  directories: {
    app: "desktop",
    output: "release",
  },
  files: ["main.cjs", "package.json", "app-icon.png", "app-icon.ico"],
  extraResources: [
    {
      from: "README.md",
      to: "app-runtime/README.md",
    },
    {
      from: "docs",
      to: "app-runtime/docs",
    },
    {
      from: "web",
      to: "app-runtime/web",
    },
    {
      from: "scripts",
      to: "app-runtime/scripts",
    },
    {
      from: "package.json",
      to: "app-runtime/package.json",
    },
  ],
  win: {
    icon: "desktop/app-icon.ico",
    target: [
      {
        target: "nsis",
        arch: ["x64"],
      },
    ],
  },
  publish: resolveGitHubPublish(),
  electronUpdaterCompatibility: ">=2.16",
  afterPack: "scripts/electron-after-pack.cjs",
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    artifactName: "${productName}-Setup-${version}.${ext}",
  },
};
