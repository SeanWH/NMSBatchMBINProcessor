#### 1.0.2

  * Fixed a bug causing the script to fail if "MBIN" is in the file path.
  * Added support for wildcards in the template field. See readme for an example.

#### 1.0.1

  * Added an example mod with presets which increase grass draw distance and diversity.

#### 1.0.0

  * Rewrote handling of MBINCompiler and PSARC. It will now de/recompile one file at a time synchronously. This can be disabled by passing the --mt option.
  * New option flags. See readme for details or pass --help.