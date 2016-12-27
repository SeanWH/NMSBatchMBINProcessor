var fs = require('fs');
var path = require('path');
var rimraf = require('rimraf');
var exec = require('child_process').exec;
var argv = require('yargs').argv;
var parseString = require('xml2js').parseString;
var xml2js = require('xml2js');
var _ = require('lodash');

var exc = (cmd)=>{
  return new Promise((resolve, reject)=>{
    var opts = {
      encoding: 'utf8',
      timeout: 0,
      maxBuffer: 4096*4096
    };
    if (process.platform === 'win32') {
      opts.shell = 'cmd.exe'; 
    }
    exec(cmd, opts, (err, stdout, stderr)=>{
      if (err) {
        reject(err);
      } else {
        resolve(stdout.trim());
      }
    });
  });
};

var walk = (dir, done)=>{
  var results = [];
  fs.readdir(dir, (err, list)=>{
    if (err) {
      return done(err);
    }
    var pending = list.length;
    if (!pending) {
      return done(null, results);
    }
    _.each(list, (file)=>{
      file = path.resolve(dir, file);
      fs.stat(file, (err, stat)=>{
        if (stat && stat.isDirectory()) {
          walk(file, (err, res)=>{
            results = results.concat(res);
            if (!--pending) {
              done(null, results);
            }
          });
        } else {
          results.push(file);
          if (!--pending) {
            done(null, results);
          }
        }
      });
    });
  });
};

var parse = ()=>{
  console.log('Parsing settings...');
  var settings = fs.readFileSync('./Settings.ini', 'utf8');
  var categories = settings.split('[');
  var settingsData = [];
  _.each(categories, (cat)=>{
    var props = cat.split(']')[1] !== undefined ? cat.split(']')[1].split('\r\n') : null;
    var propData = [];
    if (props) {
      _.each(props, (prop)=>{
        if (prop.length > 0) {
          var propParts = prop.split('=');
          var propObj = {
            key: propParts[0],
            val: propParts[1]
          };
          propData.push(propObj);
        }
      });
    }
    settingsData.push({
      id: cat.split(']')[0],
      props: propData
    });
  });
  return settingsData;
};

// Globals
var FILES = [];
var xmlFiles = [];
var completedFiles = [];
var settings = parse();
var compilable = 0;
var uncompilable = 0;
var changes = 0;
var xmlIterations = 0;
var mbin1131 = 0;
var mbin1130 = 0;
var mbinLegacy = 0;
 
var buildMODPak = (_completedFiles)=>{
  console.log('Adding MBINs to file list...');
  var fileText = '';
  var finish = false;
  _.each(_completedFiles, (file)=>{
    var fileParts = file.mbin.split(__dirname)[1].split('\\');
    fileParts = _.filter(fileParts, (part)=>{
      return part !== 'files';
    });
    fileParts = fileParts.join('/');
    fileText += `${fileParts.slice(0, 0) + fileParts.slice(1)}\n`;
  });
  fs.writeFile('./files.txt', fileText, {flag : 'w'}, (err, data)=>{
    if (err) {
      console.log('Error writing to files.txt');
    }
    setTimeout(()=>{
      var successMsg = `Patching completed. ${changes} keys changed across ${_completedFiles.length} files.`;
      exc(`.\\bin\\psarc.exe create -a -y --zlib --inputfile=./files.txt -o _MOD.BMP-${Date.now()}.pak`).then(result => {
        finish = true;
        console.log(successMsg);
        if (!argv.xml) {
          console.log(`MBINCompiler stats: ${compilable}/${uncompilable}`);
          console.log(`MBINCompiler1131.exe: ${mbin1131}`);
          console.log(`MBINCompiler1130.exe: ${mbin1130}`);
          console.log(`MBINCompilerFallback.exe: ${mbinLegacy}`);
        }
      }).catch((e)=>{
        if (!finish) {
          console.log(successMsg);
        }
      });
    }, 1000);
  });
};
 
var buildMODPakOnce = _.once(buildMODPak);
 
var handleCompleted = (builder, _completedFiles, file, k)=>{
  var checkNextCallArg = ()=>{
    if (k === _completedFiles.length - 1) {
      buildMODPak(_completedFiles);
    } else {
      ++k;
      handleCompleted(builder, _completedFiles, _completedFiles[k], k);
    }
  };
  var xml = builder.buildObject(file.data);
  fs.writeFile(file.xml, xml, {flag : 'w'}, (err, data)=>{
    if (err) console.log('ERR-B: ', err);
    var mbinFileName = file.mbin;
    exc(`.\\bin\\MBINCompiler1131.exe ${file.xml} ${mbinFileName}`).then(result => {
      console.log('Writing new MBIN: ', `${mbinFileName}`);
      checkNextCallArg();
    }).catch((e)=>{
      exc(`.\\bin\\MBINCompiler1130.exe ${file.xml} ${mbinFileName}`).then(result => {
        console.log(`Writing new MBIN using fallback (1130): ${mbinFileName}`);
        checkNextCallArg();
      }).catch((e)=>{
        exc(`.\\bin\\MBINCompilerFallback.exe ${file.xml} ${mbinFileName}`).then(result => {
          console.log(`Writing new MBIN using fallback (legacy): ${mbinFileName}`);
          checkNextCallArg();
        }).catch(()=>{
          checkNextCallArg();
          console.log(`Unable to recompile: ${mbinFileName}}`);
        });
      });
    });
  });
};
 
var writeOutXML = (result)=>{
  var _completedFiles = _.uniqBy(completedFiles, 'xml');
 
  if (_completedFiles.length === 0) {
    console.log('No XML changes detected.');
  }
 
  var builder = new xml2js.Builder();
 
  handleCompleted(builder, _completedFiles, _completedFiles[0], 0);
};

var eachRecursive = (result, obj, recursion=0, setting, settingKey, settings, xmlPath, xmlKey, xmlFilesLen, template)=>{
  var settingId = setting.id.split(':');
  var checkNextCallArg = ()=>{
    if (_.isEqual(_.last(settings), setting) && xmlIterations === xmlFilesLen) {
      writeOutXML(result);
      return;
    }
  };
  if (settingKey === 1 && recursion === 0) {
    ++xmlIterations;
    console.log(`Checking XML file (${xmlIterations}/${xmlFilesLen}): ${xmlPath}`);
  }
  checkNextCallArg();
  for (var k in obj) {
    if (_.isObject(obj[k]) && obj[k] !== null) {
      if (obj.hasOwnProperty('$') && obj.$.hasOwnProperty('template') && recursion === 0) {
        template = obj.$.template;
        if (settingId[0] !== obj.$.template) {
          return;
        }
        // Template specific changes go here, otherwise recursively iterate the object.
        // GcExternalObjectList ('Terrain Tweaker' changes)
        if (obj.$.template === 'GcExternalObjectList') {
          for (var i = result.Data.Property[0].Property.length - 1; i >= 0; i--) {
            _.each(result.Data.Property[0].Property[i].Property, (val, key)=>{
              _.each(val.Property, (val1, key1)=>{
                try {
                  if (val.Property[1].Property[0].$.value.indexOf(settingId[1]) !== -1) {
                    _.each(setting.props, (prop)=>{
                      if (val1.$.name === prop.key) {
                        result.Data.Property[0].Property[i].Property[key].Property[key1].$.value = prop.val;
                        ++changes;
                        completedFiles.push({
                          mbin: `${xmlPath.split('.exml')[0]}.MBIN`,
                          xml: xmlPath,
                          data: result
                        });
                      }
                    });
                  }
                } catch (e) {}
              })
            });
          }  
          return;
        }
      } else if (obj.hasOwnProperty('$') && obj.$.hasOwnProperty('name') && obj.$.name.indexOf(settingId[1]) !== -1) {
        try {
          _.each(setting.props, (prop)=>{
            _.each(obj[k], (__obj, __key)=>{
              if (__obj.$.name === prop.key) { 
                __obj[__key].value = prop.val;
                ++changes;
                completedFiles.push(`${xmlPath.split('.exml')[0]}.MBIN`);
              }
            })
          });
          return;
        } catch (e) {}
      }
      ++recursion
      eachRecursive(result, obj[k], recursion, setting, settingKey, xmlPath, xmlKey, xmlFilesLen, template)
      return;
    } else {
      return;
    }
  }
}
 
var updateXML = ()=>{
  var xmlFilesLen = xmlFiles.length
  _.each(xmlFiles, (xmlPath, xmlKey)=>{
    fs.readFile(xmlPath, 'utf-8', (err, data)=>{
      if (err) {
        console.log(err);
      }
      parseString(data, (err, result)=>{
        if (err) {
          console.log(err);
        }
        _.each(settings, (setting, settingKey)=>{
          eachRecursive(result, result.Data, 0, setting, settingKey, settings, xmlPath, xmlKey, xmlFilesLen);
        });
      });
    });
  });
};

var updateXMLOnce = _.once(updateXML);

var decompileMBIN = (__files, file, fileKey, fileLen, multiThreaded=false)=>{
  var checkNextCallArg = ()=>{
    if ((compilable + uncompilable) >= FILES.length || fileKey === fileLen - 1) {
      xmlFiles = _.uniq(xmlFiles);
      if (multiThreaded) {
        console.log('Please wait...');
      }
      setTimeout(()=>updateXMLOnce(xmlFiles), multiThreaded ? FILES.length * 10 : 3000);
    }
  };
  if (!multiThreaded) {
    checkNextCallArg();
  }
  var next = ()=>{
    if (!multiThreaded) {
      ++fileKey
      decompileMBIN(__files, __files[fileKey], fileKey, fileLen);
    }
  };
  var _next = _.once(next);
  var iterated = false;
  exc(`.\\bin\\MBINCompiler1131.exe ${file} ${file.split('MBIN')[0]}EXML`).then(result => {
    try {
      var xmlPath = result.split('XML data written to "')[1].split('"')[0];
      var refPath = _.findIndex(xmlFiles, xmlPath);
      if (refPath === -1) {
        iterated = true;
        xmlFiles.push(xmlPath);
        ++compilable;
        ++mbin1131;
        console.log(`Decompiled MBIN (${compilable + uncompilable}/${fileLen}): ${file}`);
      }
    } catch (e) {}
    if (multiThreaded) {
      checkNextCallArg();
    }
    _next();
  }).catch((e)=>{
    if (typeof __files[fileKey] === 'undefined') {
      checkNextCallArg();
      return;
    }
    exc(`.\\bin\\MBINCompiler1130.exe ${file} ${file.split('MBIN')[0]}EXML`).then(result => {
      if (!iterated) {
        try {
          var xmlPath = result.split('XML data written to "')[1].split('"')[0];
          var refPath = _.findIndex(xmlFiles, xmlPath);
          if (refPath === -1) {
            iterated = true;
            xmlFiles.push(xmlPath);
            ++compilable;
            ++mbin1130
            console.log(`Decompiled MBIN using fallback (1130) (${compilable + uncompilable}/${fileLen}): ${file}`);
          }
        } catch (e) {}
      }
      _next();
      if (multiThreaded) {
        checkNextCallArg();
      }
    }).catch(()=>{
      exc(`.\\bin\\MBINCompilerFallback.exe ${file} ${file.split('MBIN')[0]}EXML`).then(result => {
        if (!iterated) {
          try {
            var xmlPath = result.split('XML data written to "')[1].split('"')[0];
            var refPath = _.findIndex(xmlFiles, xmlPath);
            if (refPath === -1) {
              iterated = true;
              xmlFiles.push(xmlPath);
              ++compilable;
              ++mbinLegacy;
              console.log(`Decompiled MBIN using fallback (legacy) (${compilable + uncompilable}/${fileLen}): ${file}`);
            }
          } catch (e) {}
        }
        _next();
        if (multiThreaded) {
          checkNextCallArg();
        }
      }).catch(()=>{
        console.log(`Unable to decompile MBIN (${compilable + uncompilable}/${fileLen}): ${file}`);
        ++uncompilable;
        if (!iterated) {
          _next();
        }
        if (multiThreaded) {
          checkNextCallArg();
        }
      });
    });
  });
};
 
var decompileMBINs = (__files)=>{
  var fileLen = __files.length;
  if (argv.mt) {
    _.each(__files, (file, fileKey)=>{
      decompileMBIN(__files, file, fileKey, fileLen, true);
    });
  } else {
    decompileMBIN(__files, __files[0], 0, fileLen);
  }
};
 
var startWalk = (delay, ext)=>{
  console.log(`Searching for ${ext.split('.')[1]}s in the directory tree...`);
  setTimeout(()=>{
    walk('./', function(err, results) {
      if (err) {
        throw err;
      }
      FILES = _.filter(results, (result)=>{
        return result.indexOf(ext) !== -1;
      });
      if (FILES.length > 0) {
        if (argv.xml) {
          xmlFiles = FILES;
          setTimeout(()=>updateXMLOnce(), 3000);
        } else {
          setTimeout(()=>decompileMBINs(FILES), FILES.length);
        }
      } else {
        console.log(`Unable to find ${ext.split('.')[1]}s.`);
        return;
      }
    });
  }, delay);
};
var startWalkOnce = _.once(startWalk);

var execPsarc = (args, subDir, pakKey, pakFile)=>{
  var delayForPSARC = 5000;
  if (subDir[pakKey] === undefined) {
    startWalkOnce(delayForPSARC, '.MBIN');
  }
  exc(args).then(result => {
    console.log(`Extracting: (${pakKey+1}/${subDir.length}) ${pakFile}`);
    ++pakKey;
    execPsarc(`.\\bin\\psarc.exe extract -y --input=${subDir[pakKey]} --to=./`, subDir, pakKey, subDir[pakKey]);
  }).catch((e)=>{
 
  });
};

var unpackFiles = (cb)=>{
  fs.readdir('./', (err, subDir)=>{
    var _subDir = _.filter(subDir, (dir)=>{
      return dir.indexOf('.pak') !== -1;
    });
    execPsarc(`.\\bin\\psarc.exe extract -y --input=${_subDir[0]} --to=./`, _subDir, 0, _subDir[0]);
  });
};
 
var deleteCache = ()=>{
  var dirs = [];
  fs.readdir('./', (err, dir)=>{
    _.each(dir, (_dir)=>{
      if (_dir !== 'node_modules' && _dir !== 'bin' && _dir !== 'presets' && _dir !== 'COPYING' && _dir.indexOf('.') === -1  || _dir.indexOf('.MBIN') !== -1  || _dir.indexOf('.exml') !== -1) {
        dirs.push(_dir);
      }
    });
    if (dirs.length > 0) {
      console.log('Deleting previous files cache...');
      _.each(dirs, (dir, key)=>{
        rimraf(dir, (err)=>{
          if (err) {
            throw err;
          }
          if (key === dirs.length - 1) {
            setTimeout(()=>unpackFiles(), 1500);
          }
        });
      });
    } else {
      unpackFiles();
    }
  });
};
 
if (argv.h || argv.help) {
  console.log('Available commands');
  console.log('--mt               Enable multi-threading of MBINCompiler');
  console.log('--xml              Skip decompilation and update existing XML files');
  console.log('-h, --help         Display this message');
} else if (argv.xml) {
  startWalkOnce(0, '.exml');
} else {
  deleteCache();
}