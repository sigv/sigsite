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

function send(res, data) {
  if (typeof data === 'string') data = { 'data': data };
  if (typeof data !== 'object' || data === null) return;
  if (typeof data.data === 'undefined' || data.data === null) return;

  res.set('X-Powered-By', 'sigsite');

  res.set('Content-Type', typeof data.mimetype === 'string' ? data.mimetype : 'application/octet-stream');

  if (data.cache === false || typeof data.cache === 'undefined') res.set('Cache-Control', 'no-cache');
  else if (typeof data.cache === 'number') res.set('Cache-Control', 'max-age=' + data.cache);
  else res.set('Cache-Control', 'max-age=0');

  res.set('ETag', typeof data.tag === 'string' ? data.tag : getTag(data.data));

  if (typeof data.headers === 'object' && data.headers !== null) {
    for (var header in data.headers) {
      if (!data.headers.hasOwnProperty(header)) continue;
      res.set(header, data.headers[header]);
    }
  }

  res.status(typeof data.status === 'number' ? data.status : 200);

  res.send(data.data);
}

function sendRedirect(res, target) {
  if (typeof target !== 'string') return;

  send(res, {
    'status': 301,
    'data': '<!DOCTYPE html>\n<html lang="en">\n<head><title>Redirection</title></head><body><a href="' + target + '">' + target + '</body></html>',
    'mimetype': 'text/html',
    'cache': 0,
    'headers': {
      'Location': target,
    },
  });
}

app.use(function (req, res) {
  // Initial parsing.
  var url = req.url || '/';
  if (url.split('/').pop() === '') url += 'index';
  var sectionUrl = url + (url.split('/').pop().indexOf('.') === -1 ? '.html' : '');

  // Get some normalization going on.
  var nUrl = url, i = -1;
  while (true) {
    // Break things.
    i++; // continue;
    nUrl = nUrl.split('/');

    var frag = nUrl[i];
    if (i === 0) nUrl[i] = ''; // The URL should start with a / so there will be a nothing before that.
    else if (frag === '.') nUrl[i] = ''; // Rip out single dots as implying the current directory.
    else if (frag === '..') {
      // Rip out double dots as implying the parent directory.
      nUrl[i - 1] = nUrl[i] = '';
      i = -1; // reset;
    }

    if (i >= nUrl.length) {
      // We are done parsing.
      nUrl = nUrl.join('/');
      while (nUrl.indexOf('//') !== -1) nUrl = nUrl.split('//').join('/');
      break;
    } else {
      // Clean up for next loop.
      nUrl = nUrl.join('/');
      while (nUrl.indexOf('//') !== -1) nUrl = nUrl.split('//').join('/');
    }
  }
  while (nUrl.indexOf('//') !== -1) nUrl = nUrl.split('//').join('/');
  if (url !== nUrl) {
    sendRedirect(res, nUrl);
    return;
  }

  // And we are ready to handle this!
  if (url === '/cache.mf') {
    var data = 'CACHE MANIFEST\n# Offline all the things.\n';

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

    send(res, {
      'status': 200,
      'data': data,
      'mimetype': 'text/cache-manifest',
      'cache': 0,
    });

  } else if (typeof sections[sectionUrl] !== 'undefined') {
    // Redirect to make URLs more consistent and throw in extra SEO.
    if (url.endsWith('.html')) {
      sendRedirect(res, url.substr(0, url.length - 5 /* '.html'.length */));
      return;
    }

    send(res, {
      'status': 200,
      'data': sections[sectionUrl].data,
      'mimetype': mime.lookup(sectionUrl),
      'tag': sections[sectionUrl].tag,
      'cache': 0,
    });

  } else if (typeof staticAssets[url] !== 'undefined') {
    send(res, {
      'status': 200,
      'data': staticAssets[url].data,
      'mimetype': mime.lookup(url),
      'tag': staticAssets[url].tag,
      'cache': 0,
    });

  } else if (typeof sections['/404.html'] !== 'undefined') {
    send(res, {
      'status': 404,
      'data': sections['/404.html'].data,
      'mimetype': 'text/html',
      'tag': sections['/404.html'].tag,
      'cache': 0,
    });

  } else {
    send(res, {
      'status': 500,
      'data': template.replace('{{section}}', '<p>Something went wrong. Sorry.</p>').trimHtml(),
      'mimetype': 'text/html',
      'cache': 0,
    });

  }
});

app.listen(app.get('port'), function () {
  console.log('sigsite successfully launched on port ' + app.get('port') + '.');
});
