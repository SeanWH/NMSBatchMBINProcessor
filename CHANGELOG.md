#### 1.3.0

  * Added new option merge: Merge allows you to compile conflicting PAK by merging their XML files into a single file. This could allow two conflicting mods to work together if they use the same file, but modify different parts of it.
  * Added new option old: BMP no longer falls back to older versions of MBINCompiler when the latest cannot compile a file correctly. Old restores the old fallback behavior.
  * Added new option force: This force compiles all of the EXML files in the working directory. This is useful for compiling manual changes without needing to specify batch presets.
  * Fixed a bug causing the script to fail if Settings.ini is blank. It is blank by default now, and it is recommended to keep it empty if you are using merge or force.

#### 1.2.1

  * Fixed a bug crashing the script when modifying a lot of XML files.
  * Fixed a bug causing the script to fail when only one XML file is being modified.
  * Added PAK file naming and decompilation only options.

#### 1.1

  * Added the newest version of MBINCompiler for Pathfinder support, and moved the last version to the fallback queue.

#### 1.0

  * Rewrote handling of MBINCompiler and PSARC. It will now de/recompile one file at a time synchronously. This can be disabled by passing the --mt option.
  * New option flags. See readme for details or pass --help.