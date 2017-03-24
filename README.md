### NMS Batch MBIN Processor

This tool allows you to batch extract, decrypt, edit, and repackage files for the game No Man's Sky using MBINCompiler and PSARC.

Special thanks to monkeyman192, theFisher86, and those helping them for making tools like this possible.

#### How to use it

* Extract the archive into a directory.
* Place NMSARC.515F1D3.pak, or any other PAK files you want to experiment with from your PCBANKS directory, in the directory you extracted the archive to.
* Open cmd.exe/Powershell and run "node.exe --max_old_space_size=16192 bmp.js".
  * If you plan on extracting multiple PAK files, and don't use the BAT file, you will need to increase the RAM limit for NodeJS with the max_old_space_size flag. I suggest 16192MB if you plan to extract all the files.
* After it runs, it will create a MOD PAK file that you can place in your MODS directory.

The config file is Settings.ini. Inside the brackets [], the script will search the decompiled MBIN XML files for a Filename property.

Specific format:
[TemplateName:PropertyToTarget]
ChildPropertyName=ChildPropertyValue

Wildcard format:
[*:PropertyToTarget|Template]
ChildPropertyName=ChildPropertyValue

The "wildcard" format will target all templates, or properties inside the specified template.

It will then apply the settings you specify inside its parent block provided the keys preceding the "=" exist.

#### Available options

  * -m, --mt - Enable multi-threading of MBINCompiler
  * -d, --decompileOnly - Only decompile MBIN files
  * -x, --xml - Skip decompilation and update existing XML files
  * -f, --force - Force compiling of present EXML files
  * --merge - Deep merge two conflicting XML objects for mod concatenation
  * --old - Use older versions of MBINCompiler if the newest can\'t compile a file
  * --name - Specify the name of the output PAK file
  * -h, --help - Display this information