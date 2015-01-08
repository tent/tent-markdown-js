// Released under BSD license
// Copyright (c) 2013 Apollic Software, LLC
(function (expose) {
  var Preprocesser, forEach;

  (function (Markdown) {

    // Tent markdown flavor (https://github.com/tent/tent.io/issues/180)
    Markdown.dialects.Tent = {
      block: {
        // member name: fn(block, remaining_blocks) -> json markdown tree or undefined

        // Adapted from Markdown.dialects.Gruber.block.blockquote
        blockquote: function blockquote( block, next ) {
          if ( !block.match(/^>\s/m) ) {
            return undefined;
          }

          var jsonml = [];

          // separate out the leading abutting block, if any. I.e. in this case:
          //
          //  a
          //  > b
          //
          if ( block[ 0 ] !== ">" ) {
            var lines = block.split( /\n/ ),
                prev = [],
                line_no = block.lineNumber;

            // keep shifting lines until you find a crotchet
            while ( lines.length && lines[ 0 ][ 0 ] !== ">" ) {
              prev.push( lines.shift() );
              line_no++;
            }

            var abutting = mk_block( prev.join( "\n" ), "\n", block.lineNumber );
            jsonml.push.apply( jsonml, this.processBlock( abutting, [] ) );
            // reassemble new block of just block quotes!
            block = mk_block( lines.join( "\n" ), block.trailing, line_no );
          }


          // if the next block is also a blockquote merge it in
          while ( next.length && next[ 0 ][ 0 ] === ">" ) {
            var b = next.shift();
            block = mk_block( block + block.trailing + b, b.trailing, block.lineNumber );
          }

          // Strip off the leading "> " and re-process as a block.
          var input = block.replace( /^> ?/gm, "" ),
              old_tree = this.tree,
              processedBlock = this.toTree( input, [ "blockquote" ] ),
              attr = extract_attr( processedBlock );

          // If any link references were found get rid of them
          if ( attr && attr.references ) {
            delete attr.references;
            // And then remove the attribute object if it's empty
            if ( isEmpty( attr ) ) {
              processedBlock.splice( 1, 1 );
            }
          }

          jsonml.push( processedBlock );
          return jsonml;
        },


        // Match inline urls
        autolink: function autolink( block, next ) {
          var urls = expose.extractUrlsWithIndices(block);

          var nextBlock = function (block, next) {
            var _block = [].concat(this.dialect.block.hashtags.call(this, block, next, false));
            if (_block.length == 1) {
              _block = _block[0];
            }
            return _block;
          }

          if (!urls.length) {
            // no urls matched
            return;
          }

          var autolink_items = [];

          var item;
          for (var i = 0; i < urls.length; i++) {
            item = urls[i];

            if ( block.slice(0, item.indices[1] + 1).match(/\[[^\]]+\]\([^\)]+\)$/) ) {
              // markdown link syntax, don't autolink
              continue;
            }

            if ( (_m = block.match(/\[[^\]]+\]\([^\)]+\)/)) && (_m.index < item.indices[0]) && (_m.index + _m[0].length > item.indices[0]) ) {
              // markdown link syntax, don't autolink
              continue;
            }

            if ( block.slice(item.indices[0] - 1, block.length).match(/^\[[^\]]+\]\([^\)]+\)/) ) {
              // url inside markdown link display text, don't autolink
              continue;
            }

            if ( block.match('`') ) {
              // check if the url is inside code backticks

              var _indices = [],
                  _regex = /`/g,
                  m = null;
              while ( m = _regex.exec(block) ) {
                _indices.push(m.index);
              }

              var skip = false,
                  _last_index = null;
              if ( _indices.length && (_indices.length % 2 === 0) ) {
                for (var j = 0; j < _indices.length; j += 2) {
                  if ( (_indices[j] < item.indices[0]) && (_indices[j+1] >= item.indices[1]) ) {
                    // matched url is inside code backticks, ignore
                    _last_index = _indices[j+1];
                    skip = true;
                  }
                }
              }

              if (skip === true) {
                // don't autolink
                continue;
              }
            }

            // we're good to process this link
            autolink_items.push(item)
          }

          if (!autolink_items.length) {
            // there's nothing to autolink
            return;
          }

          // wrap matched urls in links

          var jsonml = ["para"],
              _block = block,
              item = null,
              index_offset = 0,
              before = null;

          for (var i = 0; i < autolink_items.length; i++) {
            item = autolink_items[i];

            // process text before url
            before = _block.slice(0, item.indices[0] + index_offset);
            if (before.length) {
              var before_jsonml = nextBlock.call(this, before, []) || [];
              before_jsonml = before_jsonml.length == 1 ? [before_jsonml] : before_jsonml;

              jsonml = jsonml.concat(before_jsonml);
            }

            // linkify url
            jsonml.push(["link", { href: item.url }, item.url]);

            // discard processed text
            // and update index offset
            _block = _block.slice(item.indices[1] + index_offset, _block.length)
            index_offset -= before.length + (item.indices[1] - item.indices[0])
          }

          // process remaining text
          jsonml = jsonml.concat(nextBlock.call(this, _block, next) || [] );

          return [jsonml];
        },

        hashtags: function (block, next, wrapInPara) {
          if (wrapInPara == null) wrapInPara = true;

          var hashtags = expose.extractHashtagsWithIndices(block);

          var nextBlock = function () {
            var _block = this.dialect.block.para.call(this, block, next);
            return wrapInPara ? _block : _block[0].slice(1);
          }

          if (!hashtags.length) {
            // no hashtags here, moving along
            return nextBlock.call(this);
          }

          var autolink_items = [];

          var item;
          for (var i = 0; i < hashtags.length; i++) {
            item = hashtags[i];

            if ( block.slice(0, item.indices[1] + 1).match(/\[[^\]]+\]\([^\)]+\)$/) ) {
              // markdown link syntax, don't autolink
              continue;
            }

            if ( (_m = block.match(/\[[^\]]+\]\([^\)]+\)/)) && (_m.index < item.indices[0]) && (_m.index + _m[0].length > item.indices[0]) ) {
              // markdown link syntax, don't autolink
              continue;
            }

            if ( block.slice(item.indices[0] - 1, block.length).match(/^\[[^\]]+\]\([^\)]+\)/) ) {
              // hashtag inside markdown link display text, don't autolink
              continue;
            }

            if ( block.match('`') ) {
              // check if the hashtag is inside code backticks

              var _indices = [],
                  _regex = /`/g,
                  m = null;
              while ( m = _regex.exec(block) ) {
                _indices.push(m.index);
              }

              var skip = false,
                  _last_index = null;
              if ( _indices.length && (_indices.length % 2 === 0) ) {
                for (var j = 0; j < _indices.length; j += 2) {
                  if ( (_indices[j] < item.indices[0]) && (_indices[j+1] >= item.indices[1]) ) {
                    // matched hashtag is inside code backticks, ignore
                    _last_index = _indices[j+1];
                    skip = true;
                  }
                }
              }

              if (skip === true) {
                // don't autolink
                continue;
              }
            }

            // we're good to process this hashtag
            autolink_items.push(item)
          }

          if (!autolink_items.length) {
            // there's nothing to autolink
            return nextBlock.call(this);
          }

          // wrap matched hashtags in links

          var jsonml = wrapInPara ? ["para"] : [],
              _block = block,
              item = null,
              index_offset = 0,
              before = null;

          for (var i = 0; i < autolink_items.length; i++) {
            item = autolink_items[i];

            // process text before hashtag
            before = _block.slice(0, item.indices[0] + index_offset);
            if (before.length) {
              jsonml = jsonml.concat( this.processInline(before) );
            }

            // linkify hashtag
            jsonml.push(["link", { href: '#' + item.hashtag, rel: "hashtag" }, '#' + item.hashtag]);

            // discard processed text
            // and update index offset
            _block = _block.slice(item.indices[1] + index_offset, _block.length)
            index_offset -= before.length + (item.indices[1] - item.indices[0])
          }

          // process remaining text
          jsonml = jsonml.concat( this.processInline(_block) );

          return [jsonml];
        },

        // Taken from Markdown.dialects.Gruber.block.para
        para: function para( block, next ) {
          // everything's a para!
          return [ ["para"].concat( this.processInline( block ) ) ];
        }
      },

      inline: {
        // member pattern_or_regex: (text, match, tree) -> [ length, string_or_tree ]
        // __x__ members are not patterns
        // __call__ is called by Markdown.prototype.processInline()

        /*
         * Reserved member functions:
         */

        // Taken from Markdown.dialect.Gruber.inline.__oneElement__
        __oneElement__: function oneElement( text, patterns_or_re, previous_nodes ) {
          var m,
              res,
              lastIndex = 0;

          patterns_or_re = patterns_or_re || this.dialect.inline.__patterns__;
          var re = new RegExp( "([\\s\\S]*?)(" + (patterns_or_re.source || patterns_or_re) + ")" );

          m = re.exec( text );
          if (!m) {
            // Just boring text
            return [ text.length, text ];
          }
          else if ( m[1] ) {
            // Some un-interesting text matched. Return that first
            return [ m[1].length, m[1] ];
          }

          var res;
          if ( m[2] in this.dialect.inline ) {
            res = this.dialect.inline[ m[2] ].call(
                      this,
                      text.substr( m.index ), m, previous_nodes || [] );
          }
          // Default for now to make dev easier. just slurp special and output it.
          res = res || [ m[2].length, m[2] ];
          return res;
        },

        // Taken from Markdown.dialect.Gruber.inline.__call__
        __call__: function inline( text, patterns ) {

          var out = [],
              res;

          function add(x) {
            //D:self.debug("  adding output", uneval(x));
            if ( typeof x == "string" && typeof out[out.length-1] == "string" )
              out[ out.length-1 ] += x;
            else
              out.push(x);
          }

          while ( text.length > 0 ) {
            res = this.dialect.inline.__oneElement__.call(this, text, patterns, out );
            text = text.substr( res.shift() );
            forEach(res, add )
          }

          return out;
        },

        /*
         * Pattern member functions:
         */

        // Taken from Markdown.dialects.Gruber.inline
        // These characters are intersting elsewhere, so have rules for them so that
        // chunks of plain text blocks don't include them
        "]": function () {},
        "}": function () {},

        // Taken from Markdown.dialects.Gruber.inline["\\"]
        // Modification: change escape chars (removed { } # + - . ! and added ~)
        "\\": function escaped( text ) {
          // [ length of input processed, node/children to add... ]
          // Only esacape: \ ` * _ [ ] ( ) * ~
          if ( text.match( /^\\[\\`\*_\[\]()\~]/ ) )
            return [ 2, text.charAt( 1 ) ];
          else
            // Not an esacpe
            return [ 1, "\\" ];
        },

        "*": function bold( text ) {
          // Inline content is possible inside `bold text`
          var res = Markdown.DialectHelpers.inline_until_char.call( this, text.substr(1), "*" );

          // Not bold
          if ( !res ) return [ 1, "*" ];

          var consumed = 1 + res[ 0 ],
              children = res[ 1 ];


          return [consumed, ["strong"].concat(children)]
        },

        "_": function italic( text ) {
          // Inline content is possible inside `bold text`
          var res = Markdown.DialectHelpers.inline_until_char.call( this, text.substr(1), "_" );

          // Not bold
          if ( !res ) return [ 1, "_" ];

          var consumed = 1 + res[ 0 ],
              children = res[ 1 ];


          return [consumed, ["em"].concat(children)]
        },

        "~": function strikethrough( text ) {
          // Inline content is possible inside `deleted text`
          var res = Markdown.DialectHelpers.inline_until_char.call( this, text.substr(1), "~" );

          // Not deleted text
          if ( !res ) return [ 1, "~" ];

          var consumed = 1 + res[ 0 ],
              children = res[ 1 ];

          // Ignore since there is whitespace before the closing `~`
          var last_child = children[ children.length-1 ];
          if ( typeof last_child === 'string' && last_child.substr(last_child.length - 2).match(/[\s\r\n]/) ) return [ 1, "~"];

          return [consumed, ["del"].concat(children)]
        },

        // Taken from Markdown.dialects.Gruber.inline["["]
        // Modification: Only allow the most basic link syntax.
        "[": function link( text ) {

          var orig = String(text);
          // Inline content is possible inside `link text`
          var res = Markdown.DialectHelpers.inline_until_char.call( this, text.substr(1), "]" );

          // No closing ']' found. Just consume the [
          if ( !res ) return [ 1, "[" ];

          var consumed = 1 + res[ 0 ],
              children = res[ 1 ],
              link,
              attrs;

          // At this point the first [...] has been parsed. See what follows to find
          // out which kind of link we are (reference or direct url)
          text = text.substr( consumed );

          // [link text](/path/to/img.jpg)
          //                 1             <--- captures
          // This will capture up to the last paren in the block. We then pull
          // back based on if there a matching ones in the url
          //    ([here](/url/(test))
          // The parens have to be balanced

          var m = text.match( /^\(([^"']*)\)/ );
          if ( m ) {
            var url = m[1];
            consumed += m[0].length;

            var open_parens = 1; // One open that isn't in the capture
            for ( var len = 0; len < url.length; len++ ) {
              switch ( url[len] ) {
              case "(":
                open_parens++;
                break;
              case ")":
                if ( --open_parens == 0) {
                  consumed -= url.length - len;
                  url = url.substring(0, len);
                }
                break;
              }
            }

            // Process escapes only
            url = this.dialect.inline.__call__.call( this, url, /\\/ )[0];

            attrs = { href: url || "" };

            link = [ "link", attrs ].concat( children );
            return [ consumed, link ];
          }

          // Just consume the "["
          return [ 1, "[" ];
        },

        // Taken from Markdown.dialects.Gruber.inline["`"]
        // Modification: Only allow a single opening backtick
        "`": function inlineCode( text ) {
          // Always skip over the opening tick.
          var m = text.match( /(`)(([\s\S]*?)\1)/ );

          if ( m && m[2] )
            return [ m[1].length + m[2].length, [ "inlinecode", m[3] ] ];
          else {
            // No closing backtick, it's just text
            return [ 1, "`" ];
          }
        },

        // Taken from Markdown.dialects.Gruber.inline["  \n"]
        // Modification: Don't require spaces before \n
        "\n": function lineBreak( text ) {
          return [ 1, [ "linebreak" ] ];
        }

      }
    }

    Markdown.buildBlockOrder ( Markdown.dialects.Tent.block );
    Markdown.buildInlinePatterns( Markdown.dialects.Tent.inline );

    var isArray = Array.isArray || function(obj) {
      return Object.prototype.toString.call(obj) === "[object Array]";
    };

    function extract_attr( jsonml ) {
      return isArray(jsonml) && jsonml.length > 1 && typeof jsonml[ 1 ] === "object" && !( isArray(jsonml[ 1 ]) ) ? jsonml[ 1 ] : undefined;
    }

    // For Spidermonkey based engines
    function mk_block_toSource() {
      return "Markdown.mk_block( " +
              uneval(this.toString()) +
              ", " +
              uneval(this.trailing) +
              ", " +
              uneval(this.lineNumber) +
              " )";
    }

    // node
    function mk_block_inspect() {
      var util = require("util");
      return "Markdown.mk_block( " +
              util.inspect(this.toString()) +
              ", " +
              util.inspect(this.trailing) +
              ", " +
              util.inspect(this.lineNumber) +
              " )";

    }

    var mk_block = Markdown.mk_block = function(block, trail, line) {
      // Be helpful for default case in tests.
      if ( arguments.length === 1 )
        trail = "\n\n";

      // We actually need a String object, not a string primitive
      /* jshint -W053 */
      var s = new String(block);
      s.trailing = trail;
      // To make it clear its not just a string
      s.inspect = mk_block_inspect;
      s.toSource = mk_block_toSource;

      if ( line !== undefined )
        s.lineNumber = line;

      return s;
    };

  })( expose.Markdown )

  // Don't mess with Array.prototype. Its not friendly
  if ( Array.prototype.forEach ) {
    forEach = function( arr, cb, thisp ) {
      return arr.forEach( cb, thisp );
    };
  }
  else {
    forEach = function(arr, cb, thisp) {
      for (var i = 0; i < arr.length; i++) {
        cb.call(thisp || arr, arr[i], i, arr);
      }
    }
  }

  Preprocesser = function ( options ) {
    this.footnotes = options.footnotes || [];
    this.hashtagURITemplate = options.hashtagURITemplate || '?hashtag={hashtag}';
    this.preprocessors = [this.expandFootnoteLinkHrefs, this.expandHashtagHrefs].concat(options.preprocessors || []);
  }

  Preprocesser.prototype.expandFootnoteLinkHrefs = function ( jsonml ) {
    // Skip over anything that isn't a link
    if (jsonml[0] !== 'link') return jsonml;

    // Skip over links that arn't footnotes
    if (!jsonml[1] || !jsonml[1].href || !/^\d+$/.test(jsonml[1].href)) return jsonml;

    // Get href from footnodes array
    var index = parseInt(jsonml[1].href);
    jsonml[1].href = this.footnotes[index];

    // Unlink node if footnote doesn't exist
    if (!jsonml[1].href) {
      return [null].concat(jsonml.slice(2));
    }

    return jsonml;
  }

  Preprocesser.prototype.expandHashtagHrefs = function ( jsonml ) {
    // Skip over anything that isn't a link
    if (jsonml[0] !== 'link') return jsonml;

    // Skip over links that aren't hashtags
    if (!jsonml[1].rel || jsonml[1].rel !== 'hashtag') return jsonml;

    // remove # prefix
    var hashtag = decodeURIComponent(jsonml[1].href).substr(1);

    jsonml[1].href = this.hashtagURITemplate.replace('{hashtag}', encodeURIComponent(hashtag));

    return jsonml;
  }

  Preprocesser.prototype.preprocessTreeNode = function ( jsonml, references ) {
    for (var i=0, _len = this.preprocessors.length; i < _len; i++) {
      var fn = this.preprocessors[i]
      if (!(typeof fn === 'function')) continue;
      jsonml = fn.call(this, jsonml, references);
    }
    return jsonml;
  }

  // Pre-process all link nodes to expand the [text](index) footnote syntax to actual links
  // and unlink non-existant footnote references.
  // Pass options.footnotes = [ href, ... ] to expand footnote links
  __toHTML__ = expose.toHTML;
  expose.toHTML = function ( source, dialect, options ) {
    options = options || {};
    if (dialect === 'Tent') {
      if (!(typeof options.preprocessTreeNode === 'function')) {
        preprocesser = new Preprocesser( options );
        options.preprocessTreeNode = function () {
          return preprocesser.preprocessTreeNode.apply(preprocesser, arguments);
        }
      }
    }
    return __toHTML__.call(null, source, dialect, options);
  }
})(function () {
  if ( typeof exports === "undefined" ) {
    window.markdown.extractUrlsWithIndices = window.twttr.extractUrlsWithIndices;
    window.markdown.extractHashtagsWithIndices = window.twttr.extractHashtagsWithIndices;
    return window.markdown;
  }
  else {
    exports.markdown = require('markdown').markdown;
    exports.markdown.extractUrlsWithIndices = require('./link-matcher').extractUrlsWithIndices;
    exports.markdown.extractHashtagsWithIndices = require('./link-matcher').extractHashtagsWithIndices;

    return exports.markdown;
  }
}())
