module.exports = {
  "hooks": {
    "after:bump": "npx auto-changelog -p",
    "after:github:release": "just clean",
    "before:release": "just build",
    "before:init": "just clean",
    "after:init": "just check",
  },
  "plugins": {
    "@release-it/bumper": {
      "in": {
        "file": "config.json",
        "type": "application/json",
        "path": "version",
      },
      "out": {
        "file": "config.json",
        "type": "application/json",
        "path": "version",
      },
    },
  },
  "git": {
    "changelog":
      "npx auto-changelog --stdout --commit-limit false -u --template https://raw.githubusercontent.com/release-it/release-it/main/templates/changelog-compact.hbs",
  },
  "npm": {
    "publish": false,
  },
  "github": {
    "release": true,
    "assets": [
      "build/**/*.tgz",
    ],
    // "web": true
  },
};
