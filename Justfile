build:
  #!/usr/bin/env sh
  declare -a TARGETS
  TARGETS=(x86_64-unknown-linux-gnu x86_64-apple-darwin aarch64-apple-darwin)
  for TARGET in "${TARGETS[@]}"; do
    deno compile --allow-all --unstable --target $TARGET --output ./build/$TARGET/msh --node-modules-dir=false main.ts
  done
