var fs = require('graceful-fs');
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
  try {
    var settings = fs.readFileSync('./Settings.ini', 'utf8');
    if (settings.length === 0) {
      return [];
    }
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
  } catch (e) {
    console.log(e);
    return [];
  }
};

// Globals
var listedFiles = [];
var duplicateFiles = [];
var duplicateXMLObjects = [];
var originalFile = null;
var FILES = [];
var miscFiles = [];
var xmlFiles = [];
var completedFiles = [];
var allFiles = [];
var settings = parse();
var compilable = 0;
var uncompilable = 0;
var changes = 0;
var xmlIterations = 0;
var mbin1200 = 0;
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
      exc(`.\\bin\\psarc.exe create -a -y --zlib --inputfile=./files.txt -o _MOD.BMP_${argv.name ? argv.name : Date.now()}.pak`).then(result => {
        finish = true;
        console.log(successMsg);
        if (!argv.xml && !argv.x) {
          console.log(`MBINCompiler stats: ${compilable} succeeded, ${uncompilable} failed`);
          console.log(`MBINCompiler1200.exe: ${mbin1200}`);
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
      buildMODPakOnce(_completedFiles);
    } else {
      ++k;
      handleCompleted(builder, _completedFiles, _completedFiles[k], k);
    }
  };
  try {
    var xml = builder.buildObject(file.data);
  } catch (e) {

  }
  if (!_.isString(file.xml)) {
    checkNextCallArg();
    return;
  }
  fs.writeFile(file.xml, xml, {flag : 'w'}, (err, data)=>{
    if (err) console.log('ERR-B: ', err);
    var mbinFileName = file.mbin;
    exc(`.\\bin\\MBINCompiler1200.exe ${file.xml} ${mbinFileName}`).then(result => {
      console.log('Writing new MBIN: ', `${mbinFileName}`);
      checkNextCallArg();
    }).catch((e)=>{
      if (!argv.old) {
        console.log(`Unable to recompile: ${mbinFileName}}`);
        _.pullAt(_completedFiles, k);
        checkNextCallArg();
        return;
      }
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
            _.pullAt(_completedFiles, k);
            checkNextCallArg();
            console.log(`Unable to recompile: ${mbinFileName}}`);
          });
        });
      });
    });
  });
};

var writeOutXML = (result)=>{
  var _completedFiles = _.uniqBy(completedFiles, 'xml');

  if (_completedFiles.length === 0) {
    if (!argv.f && !argv.force && !argv.merge) {
      console.log('No XML changes detected.');
    } else {
      console.log('Skipping Setting.ini, recompiling all indexed EXMLs.');
    }
  }

  if (argv.f || argv.force || argv.merge || settings.length === 0) {
    _completedFiles = _.uniqBy(allFiles, 'xml');
    _completedFiles = _completedFiles.concat(miscFiles);
  }

  var builder = new xml2js.Builder();

  handleCompleted(builder, _completedFiles, _completedFiles[0], 0);
};

var eachRecursive = (result, obj, recursion=0, setting, settingKey, settings, xmlPath, xmlKey, xmlFilesLen, template)=>{
  var settingId = setting.id.split(':');
  var checkNextCallArg = ()=>{
    if ((_.isEqual(_.last(settings), setting) || argv.f || argv.force || argv.merge) && xmlIterations === xmlFilesLen // - 1 ?
      || xmlIterations === allFiles.length - 1 && (argv.f || argv.force || argv.merge)) {
      writeOutXML(result);
      return;
    }
  };
  if (settingKey === 1 && recursion === 0 || settingId === undefined) {
    ++xmlIterations;
    console.log(`Checking XML file (${xmlIterations}/${xmlFilesLen}): ${xmlPath}`);
  }
  for (var k in obj) {
    if (_.isObject(obj[k]) && obj[k] !== null) {
      if (obj.hasOwnProperty('$') && obj.$.hasOwnProperty('template')) {
        template = obj.$.template;
        let changed = null;
        if (settingId[0] === obj.$.template) {
          for (var i = result.Data.Property[0].Property.length - 1; i >= 0; i--) {
            _.each(result.Data.Property[0].Property[i].Property, (val, key)=>{
              _.each(val.Property, (val1, key1)=>{
                try {
                  if (val.Property[1].Property[0].$.value.indexOf(settingId[1]) !== -1) {
                    _.each(setting.props, (prop)=>{
                      if (val1.$.name === prop.key) {
                        result.Data.Property[0].Property[i].Property[key].Property[key1].$.value = prop.val;
                        changed = true;
                        completedFiles.push({
                          mbin: `${xmlPath.split('.exml')[0]}.MBIN`,
                          xml: xmlPath,
                          data: result
                        });
                      }
                    });
                  }
                } catch (e) {}
              });
            });
          }
        } else if (settingId[0] === '*') {
          var recurseCollections = (object, prop=null, run=0)=>{
            var nextRun = run + 1;
            _.each(object, (value, key)=>{
              try {
                if (key === 'Property') {
                  _.each(object[key], (aVal, aKey)=>{
                    recurseCollections(object[key][aKey], prop, nextRun);
                  });
                } else {
                  try {
                    if (object[key].name === prop.key && (settingId[0] === '*' || settingId[0] === template)) {
                      object[key].value = prop.val;
                      changed = true;
                      completedFiles.push({
                        mbin: `${xmlPath.split('.exml')[0]}.MBIN`,
                        xml: xmlPath,
                        data: result
                      });
                    }
                  } catch (e) {}
                }
              } catch (e) {}
            });
          };
          _.each(setting.props, (prop)=>{
            recurseCollections(obj, prop);
          });
          ++recursion;
          eachRecursive(result, obj[k], recursion, setting, settingKey, xmlPath, xmlKey, xmlFilesLen, template);
        }
        if (changed) {
          ++changes;
        }
      }
      allFiles.push({
        mbin: `${xmlPath.split('.exml')[0]}.MBIN`,
        xml: xmlPath,
        data: result
      });
      checkNextCallArg();
      return;
    } else {
      return;
    }
  }
}

var mergeDuplicateXMLObjects = (xml)=>{
  _.each(duplicateXMLObjects, (dupe)=>{
    _.assignIn(xml, dupe);
  });
  duplicateXMLObjects = [];
  return xml;
};

var updateXML = ()=>{
  var xmlFilesLen = xmlFiles.length
  _.each(xmlFiles, (xmlPath, xmlKey)=>{
    let lastIter = xmlKey === xmlFilesLen - 1;
    fs.readFile(xmlPath, 'utf-8', (err, data)=>{
      if (err) {
        console.log(err)
        return;
      }
      parseString(data, (err, result)=>{
        if (err) {
          console.log(err)
          return;
        }
        let isOriginal = null;
        if (argv.merge) {
          let dupes = _.filter(xmlFiles, (file)=>{
            return file.indexOf('duplicate') !== -1
          });
          _.each(dupes, (dupe)=>{
            dupe = dupe.replace(/.MBIN/g, '.exml');
            let dupePart = _.last(dupe.split('\\'));
            if (xmlPath.indexOf(dupePart) !== -1) {
              if (xmlPath.indexOf('duplicate') !== -1) {
                duplicateXMLObjects.push(result);
              } else {
                isOriginal = true;
              }
            }
          });
          if (isOriginal) {
            result = mergeDuplicateXMLObjects(result);
            console.log(`Merged XML object: ${xmlPath}`);
          }
        }
        if (settings.length === 0 && (argv.f || argv.force || argv.merge)) {
          if (xmlPath.indexOf('duplicate') === -1) {
            allFiles.push({
              mbin: `${xmlPath.split('.exml')[0]}.MBIN`,
              xml: xmlPath,
              data: result
            });
          }
          if (lastIter) {
            writeOutXML();
          }
        } else {
          if (xmlPath.indexOf('duplicate') === -1) {
            _.each(settings, (setting, settingKey)=>{
              eachRecursive(result, result.Data, 0, setting, settingKey, settings, xmlPath, xmlKey, xmlFilesLen);
            });
          }
        }
      });
    });
  });
};

var updateXMLOnce = _.once(updateXML);

var decompileMBIN = (__files, file, fileKey, fileLen, multiThreaded=false)=>{
  var checkNextCallArg = ()=>{
    if ((compilable + uncompilable) >= FILES.length || fileKey === fileLen - 1) {
      if (argv.decompileOnly || argv.d) {
        return;
      }
      xmlFiles = _.uniq(xmlFiles);

      console.log('Please wait...');

      setTimeout(()=>updateXMLOnce(xmlFiles), multiThreaded ? FILES.length * 10 : FILES.length * 10);
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
  exc(`.\\bin\\MBINCompiler1200.exe ${file} ${file.split('.MBIN')[0]}.EXML`).then(result => {
    try {
      var xmlPath = result.split('XML data written to "')[1].split('"')[0];
      var refPath = _.findIndex(xmlFiles, xmlPath);
      if (refPath === -1) {
        iterated = true;
        xmlFiles.push(xmlPath);
        ++compilable;
        ++mbin1200;
        console.log(`Decompiled MBIN (${compilable + uncompilable}/${fileLen}): ${file}`);
      }
    } catch (e) {}
    if (multiThreaded) {
      checkNextCallArg();
    }
    _next();
  }).catch((e)=>{
    if (typeof __files[fileKey] === 'undefined' || !argv.old) {
      _.pullAt(__files, fileKey);
      checkNextCallArg();
      return;
    }
    exc(`.\\bin\\MBINCompiler1131.exe ${file} ${file.split('.MBIN')[0]}.EXML`).then(result => {
      try {
        var xmlPath = result.split('XML data written to "')[1].split('"')[0];
        var refPath = _.findIndex(xmlFiles, xmlPath);
        if (refPath === -1) {
          iterated = true;
          xmlFiles.push(xmlPath);
          ++compilable;
          ++mbin1131;
          console.log(`Decompiled MBIN using fallback (1131) (${compilable + uncompilable}/${fileLen}): ${file}`);
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
      exc(`.\\bin\\MBINCompiler1130.exe ${file} ${file.split('.MBIN')[0]}.EXML`).then(result => {
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
        exc(`.\\bin\\MBINCompilerFallback.exe ${file} ${file.split('.MBIN')[0]}.EXML`).then(result => {
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
  });
};

var decompileMBINs = (__files)=>{
  var fileLen = __files.length;
  if (argv.mt || argv.m) {
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
      let dupes = _.filter(results, (result)=>{
        return result.indexOf('duplicate') !== -1
      });
      FILES = _.filter(results, (result)=>{
        return result.indexOf(ext) !== -1 && result.indexOf('duplicate') === -1;
      });
      FILES = _.filter(FILES, (result)=>{
        return result.indexOf('.DDS') === -1 && result.indexOf('.BIN') === -1
      });
      FILES = FILES.concat(dupes);

      _.each(results, (result)=>{
        if (result.indexOf('.DDS') !== -1 || result.indexOf('.BIN') !== -1) {
          miscFiles.push({
            mbin: result,
            xml: null,
            data: null
          });
        }
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

var execPsarc = (args, subDir, pakKey, pakFile, subDirLen)=>{
  var delayForPSARC = 5000;
  if (subDir[pakKey] === undefined || pakKey > subDirLen) {
    startWalkOnce(delayForPSARC, '.MBIN');
  }
  let nextArg = null;
  exc(`.\\bin\\psarc.exe list -v ${subDir[pakKey]}`).then(result => {
    let output = result.split('\n');
    let isDupe = null;

    _.pullAt(output, 0);
    _.each(output, (file, key)=>{
      let name = output[key].split(' (')[0];
      if (listedFiles.indexOf(name) === -1) {
        listedFiles.push(name);
        return;
      } else {
        isDupe = true;
        console.log(`Duplicate MBINs found - ${name} from ${subDir[pakKey]}. Use --force to continue, or --merge to reconcile changes.`);
        return;
      }
    });

    if (argv.merge && isDupe) {
      nextArg = `.\\bin\\psarc.exe extract -y --input=${subDir[pakKey]} --to=./__duplicate_${(Math.random() * 10000).toString().split('.')[0]}`;
    } else {
      nextArg = `.\\bin\\psarc.exe extract -y --input=${subDir[pakKey]} --to=./`;
    }
    exc(args).then(result => {
      console.log(`Extracting: (${pakKey+1}/${subDir.length}) ${pakFile}`);
      ++pakKey;
      execPsarc(nextArg, subDir, pakKey, subDir[pakKey], subDirLen);
    }).catch((e)=>{
      console.log(e)
    });
  }).catch((e)=>{
    if (pakFile.indexOf(' ') !== -1) {
      console.log(`PAK file names shouldn't contain spaces. Offending file: ${pakFile}`);
      return;
    }
    console.log(typeof pakFile !== 'undefined' ? `Skipping ${pakFile}...` : '');
    execPsarc(nextArg, subDir, pakKey, subDir[pakKey], subDirLen);
  });
};

var unpackFiles = (cb)=>{
  fs.readdir('./', (err, subDir)=>{
    var _subDir = _.filter(subDir, (dir)=>{
      return dir.indexOf('.pak') !== -1;
    });
    const subDirLen = _subDir.length;
    execPsarc(`.\\bin\\psarc.exe extract -y --input=${_subDir[0]} --to=./`, _subDir, 0, _subDir[0], subDirLen);
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
  console.log('-m, --mt               Enable multi-threading of MBINCompiler');
  console.log('-d, --decompileOnly    Only decompile MBIN files');
  console.log('-x, --xml              Skip decompilation and update existing XML files');
  console.log('-f, --force            Force compiling of present EXML files');
  console.log('--merge                Deep merge two conflicting XML objects for mod concatenation');
  console.log('--old                  Use older versions of MBINCompiler if the newest can\'t compile a file');
  console.log('--name                 Specify the name of the output PAK file');
  console.log('-h, --help             Display this message');
} else if (argv.xml || argv.x) {
  startWalkOnce(0, '.exml');
} else {
  deleteCache();
}