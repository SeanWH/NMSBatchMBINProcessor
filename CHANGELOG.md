#### 1.2.1

  * Fixed a bug crashing the script when modifying a lot of XML files.
  * Fixed a bug causing the script to fail when only one XML file is being modified.
  * Added PAK file naming and decompilation only options.

#### 1.1

  * Added the newest version of MBINCompiler for Pathfinder support, and moved the last version to the fallback queue.

#### 1.0

  * Rewrote handling of MBINCompiler and PSARC. It will now de/recompile one file at a time synchronously. This can be disabled by passing the --mt option.
  * New option flags. See readme for details or pass --help.