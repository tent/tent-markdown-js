(function (expose) {
  var Preprocesser, forEach;

  (function (Markdown) {

    // Tent markdown flavor (https://github.com/tent/tent.io/issues/180)
    Markdown.dialects.Tent = {
      block: {
        // member name: fn(block, remaining_blocks) -> json markdown tree or undefined

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

        "~": function italic( text ) {
          // Inline content is possible inside `bold text`
          var res = Markdown.DialectHelpers.inline_until_char.call( this, text.substr(1), "~" );

          // Not bold
          if ( !res ) return [ 1, "~" ];

          var consumed = 1 + res[ 0 ],
              children = res[ 1 ];


          return [consumed, ["strikethrough"].concat(children)]
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
          return [ 3, [ "linebreak" ] ];
        }

      }
    }

    Markdown.buildBlockOrder ( Markdown.dialects.Tent.block );
    Markdown.buildInlinePatterns( Markdown.dialects.Tent.inline );

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
    this.preprocessors = [this.expandFootnoteLinkHrefs].concat(options.preprocessors || []);
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
    return window.markdown;
  }
  else {
    exports.markdown = require('markdown').markdown;
    return exports.markdown;
  }
}())
