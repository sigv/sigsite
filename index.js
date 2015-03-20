/* jshint node: true */
function customHtmlCleaner(source, url) {
  // You can modify the section HTML output and URL here.

  var noExtUrl = url.split('/');
  noExtUrl.push(noExtUrl.pop().split('.').slice(0, -1));
  noExtUrl = noExtUrl.join('/');

  source = source.split('href="' + noExtUrl + '"')
    .join('href="' + noExtUrl + '" class="selected"');
  if (noExtUrl.split('/').pop() === 'index') {
    noExtUrl = '/' + noExtUrl.split('/').slice(0, -1).join('/');
    source = source.split('href="' + noExtUrl + '"')
      .join('href="' + noExtUrl + '" class="selected"');
  }

  // You can return the `source` string (the URL will be left untouched) or the full object.
  return { 'data': source, 'url': url };
}

String.prototype.startsWith = function startsWith(other) {
  return typeof other === 'string' ? this.substr(0, other.length) === other : false;
};

String.prototype.endsWith = function endsWith(other) {
  return typeof other === 'string' ? this.substr(this.length - other.length, other.length) === other : false;
};

String.prototype.trimHtml = function trimHtml() {
  var arr = this.split('\n').join('').split('\t').join('').split('>');
  var out = '';

  for (var i = 0; i < arr.length; i++) {
    var el = arr[i];
    if (el.trim().length === 0) continue; // Skip this madness.
    el += '>';

    if (el.startsWith('<!--') && el.endsWith('-->') && !el.startsWith('<!--[if')) {
      // Skip comments, unless they are IE conditionals. *sighs*
      continue;
    } else if (el.startsWith('<!DOCTYPE ')) {
      // Add a newline after the DOCTYPE.
      // This is per W3C recommendation: https://www.w3.org/TR/html5/syntax.html#writing
      out += el + '\n';
    } else if (el === '<html>' || el.startsWith('<html ')) {
      // Add a newline after the html element's start tag.
      // This is per W3C recommendation: https://www.w3.org/TR/html5/syntax.html#writing
      out += el + '\n';
    } else {
      out += el;
    }
  }

  return out;
};

var crypto = require('crypto');
var fs = require('fs');

var mime = null;
try {
  mime = require('mime');
} catch (err) {
  switch (err.code) {
  case 'MODULE_NOT_FOUND':
    // The module is not available.
    console.warn('The mime module could not be found. Trying to patch up. You should run `npm install`.');
    mime = { lookup: function lookup() { return 'application/octet-stream'; } };
    break;
  default:
    // Something else went wrong. Re-throw.
    throw err;
  }
}

var express = null;
try {
  express = require('express');
} catch (err) {
  switch (err.code) {
  case 'MODULE_NOT_FOUND':
    // The module is not available.
    console.error('The express module could not be found. Aborting. Run `npm install`.');
    process.exit(1);
    break;
  default:
    // Something else went wrong. Re-throw.
    throw err;
  }
}
var app = express();

var template = '';
var sections = {};
var staticAssets = {};
var cacheables = [];

function getTag(data) {
  if (typeof data === 'undefined' || data === null) return null;
  return crypto.createHash('md5').update(data.toString('base64')).digest('hex');
}

function loadDirectorySync(rootDir, rootUrl, cleaner) {
  if (typeof rootDir !== 'string') return {};

  if (typeof rootUrl === 'function') { cleaner = rootUrl; rootUrl = null; }
  if (typeof rootUrl !== 'string') { rootUrl = '/'; }
  if (typeof cleaner !== 'function') { cleaner = function (data, url) { return { 'data': data, 'url': url }; }; }

  var out = {};

  var fullDir = __dirname + '/' + rootDir;
  var titles = fs.readdirSync(fullDir);
  for (var i = 0; i < titles.length; i++) {
    var title = titles[i];
    if (title.substr(0, 1) === '.') continue; // skip dotfiles

    var fullPath = fullDir + '/' + title;
    var stats = fs.statSync(fullPath);

    if (stats.isFile()) {
      var url = rootUrl + title;
      var res = cleaner(fs.readFileSync(fullPath, { encoding: null }), url);
      if (typeof res === 'string') res = { 'data': res, 'url': url };
      if (typeof res !== 'object' || res === null) continue;
      out[res.url] = { 'data': res.data, 'tag': getTag(res.data) };

    } else if (stats.isDirectory()) {
      var xout = loadDirectorySync(rootDir + '/' + title, rootUrl + '/' + title, cleaner);
      for (var xkey in xout) {
        if (!xout.hasOwnProperty(xkey)) continue; // JS trickery
        out[xkey] = xout[xkey];
      }

    } else console.warn('The stats for ' + rootDir + '/' + title + ' were weird. Ignoring.');
  }

  return out;
}

function loadSync() {
  try {
    template = fs.readFileSync(__dirname + '/template.html', { encoding: 'utf8' }).trimHtml();
  } catch (err) {
    switch (err.code) {
    case 'ENOENT':
      // The file is missing.
      console.error('Expected a template.html to provide the baseline layout. The file could not be found. Aborting.');
      process.exit(1);
      break;
    default:
      // Something else went wrong. Re-throw.
      throw err;
    }
  }

  sections = loadDirectorySync('sections', '/', function (data, url) {
    url = url.toLowerCase();

    var section = template.replace('{{section}}', data.toString('utf8')).trimHtml();
    var cleanedSection = customHtmlCleaner(section, url);

    if (typeof cleanedSection === 'string') {
      // we got plain html back.
      return { 'data': cleanedSection.trimHtml(), 'url': url };
    } else if (typeof cleanedSection === 'object' && cleanedSection !== null) {
      // we got a full object back.
      return { 'data': (cleanedSection.data || section).trimHtml(), 'url': (cleanedSection.url || url) };
    } else {
      // we got weirdness back. fluff that.
      console.warn('The custom HTML cleaner returned weird data. Ignoring. (data=' + JSON.stringify(cleanedSection) + ')');
      return { 'data': section, 'url': url };
    }
  });

  staticAssets = loadDirectorySync('public', '/');

  try {
    cacheables = fs.readFileSync(__dirname + '/cache.mf', { encoding: 'utf8' }).split('\n').filter(function (line) { return line.trim() !== ''; });
  } catch (err) {
    switch (err.code) {
    case 'ENOENT':
      // The file is missing.
      console.warn('Expected a cache.mf to provide AppCache rules. The file could not be found. Ignoring.');
      cacheables = [];
      break;
    default:
      // Something else went wrong. Re-throw.
      throw err;
    }
  }
}

loadSync();

app.set('etag', 'strong');

app.disable('x-powered-by');

app.set('port', process.env.PORT || 5000);

try {
  app.use(require('compression')());
} catch (err) {
  switch (err.code) {
  case 'MODULE_NOT_FOUND':
    // The module is not available.
    console.warn('The compression module could not be found. Ignoring. You should run `npm install`.');
    break;
  default:
    // Something else went wrong. Re-throw.
    throw err;
  }
}

try {
  app.use(require('express-uncapitalize')());
} catch (err) {
  switch (err.code) {
  case 'MODULE_NOT_FOUND':
    // The module is not available.
    console.warn('The express-uncapitalize module could not be found. Ignoring. You should run `npm install`.');
    break;
  default:
    // Something else went wrong. Re-throw.
    throw err;
  }
}

try {
  app.use(require('serve-favicon')(__dirname + '/public/icon.png'));
} catch (err) {
  switch (err.code) {
  case 'MODULE_NOT_FOUND':
    // The module is not available.
    console.warn('The serve-favicon module could not be found. Ignoring. You should run `npm install`.');
    break;
  case 'ENOENT':
    // The file is missing.
    console.warn('Expected an icon.png inside public/ to provide a favicon. File could not be found. Ignoring.');
    break;
  default:
    // Something else went wrong. Re-throw.
    throw err;
  }
}

app.use(function (req, res) {
  var url = req.url || '/';
  if (url.split('/').pop() === '') url += 'index';
  var sectionUrl = url + (url.split('/').pop().indexOf('.') === -1 ? '.html' : '');

  var mimetype = 'application/octet-stream';
  var status = 404;
  var data = '';
  var tag = null;

  if (url === '/cache.mf') {
    mimetype = 'text/cache-manifest';
    status = 200;
    data = 'CACHE MANIFEST\n# Offline all the things.\n';

    data += '\n';
    for (var sk in sections) {
      if (!sections.hasOwnProperty(sk)) continue;
      if (typeof sections[sk].tag === 'undefined') sections[sk].tag = getTag(sections[sk].data);
      data += '# ' + sections[sk].tag + '\n' + sk.substr(0, sk.length - 5 /* '.html'.length */) + '\n';
    }

    data += '\nCACHE:\n';
    for (var sak in staticAssets) {
      if (!staticAssets.hasOwnProperty(sak)) continue;
      if (typeof staticAssets[sak].tag === 'undefined') staticAssets[sak].tag = getTag(staticAssets[sak].data);
      data += '# ' + staticAssets[sak].tag + '\n' + sak + '\n';
    }
    if (cacheables.length > 0) {
      data += '# Extras\n' + cacheables.join('\n') + '\n';
    }

    data += '\nNETWORK:\n*\n';

  } else if (typeof sections[sectionUrl] !== 'undefined') {
    mimetype = mime.lookup(sectionUrl);
    status = 200;
    data = sections[sectionUrl].data;

  } else if (typeof staticAssets[url] !== 'undefined') {
    mimetype = mime.lookup(url);
    status = 200;
    data = staticAssets[url].data;

  } else if (typeof sections['/404.html'] !== 'undefined') {
    mimetype = 'text/html';
    status = 404;
    data = sections['/404.html'].data;

  } else {
    mimetype = 'text/html';
    status = 500;
    data = template.replace('{{section}}', '<p>Something went wrong. Sorry.</p>').trimHtml();

  }

  res.set('X-Powered-By', 'sigsite');

  switch (mimetype.split(';')[0]) {
  case 'text/html':
  case 'text/cache-manifest':
    res.set('Content-Type', mimetype);
    break;
  default:
    res.set('Content-Type', mimetype);
    break;
  }

  res.set('Cache-Control', 'max-age=0'); // AppCache will take care of this anyway.
  res.set('ETag', tag === null ? getTag(data) : tag);

  res.status(status);

  res.send(data);
});

app.listen(app.get('port'), function () {
  console.log('sigsite successfully launched on port ' + app.get('port') + '.');
});
