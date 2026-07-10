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
