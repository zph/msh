module.exports = {
  "hooks": {
    "after:bump": "npx auto-changelog -p",
    "before:release": "just build",
  },
  "plugins": {
    "@release-it/bumper": {
      "in": {
        "file": "deno.jsonc",
        "type": "application/json",
        "path": "version"
      },
      "out": {
        "file": "deno.jsonc",
        "type": "application/json",
        "path": "version"
      }
    },
  },
  "git": {
    "changelog": "npx auto-changelog --stdout --commit-limit false -u --template https://raw.githubusercontent.com/release-it/release-it/main/templates/changelog-compact.hbs"
  },
  "npm": {
    "publish": false
  },
  "github": {
    "release": true,
    "assets": [
      "build/*"
    ],
    "web": true
  }
}
