# tent-markdown-js [![Build Status](https://travis-ci.org/tent/tent-markdown-js.png?branch=master)](https://travis-ci.org/tent/tent-markdown-js)

[Tent](https://tent.io) Dialect for [markdown-js](https://github.com/evilstreak/markdown-js).

## Installation

    npm install tent-markdown

## Usage

### Node

```js
var markdown = require( "tent-markdown" ).markdown;
console.log( markdown.toHTML( "Hello *World*!", "Tent", { footnotes: [] } ) );
```

### Browser

```html
<!DOCTYPE html>
<html>
  <body>
    <textarea id="text-input" oninput="this.editor.update()"
              rows="6" cols="60">^[You](0), Type _Tent_ **Markdown** here.</textarea>
    <div id="preview"> </div>
    <script src="lib/tent-markdown.js"></script>
    <script>
      function Editor(input, preview) {
        this.update = function () {
          preview.innerHTML = markdown.toHTML(input.value, 'Tent', { footnotes: ["https://entity.example.org"] });
        };
        input.editor = this;
        this.update();
      }
      var $ = function (id) { return document.getElementById(id); };
      new Editor($("text-input"), $("preview"));
    </script>
  </body>
</html>
```

The above example is adapted from [markdown-js](https://github.com/evilstreak/markdown-js).

Simply put,

```javascript
  var source = "^[Example Mention](0), *Bold*, _Italic_, ~Strikethrough~, [Regular link](https://tent.io)...",
      entity_uris = ["https://entity.example.org"];
  window.markdown.toHTML( source, 'Tent', { footnotes: entity_uris } )
```

where `entity_uris` is an `Array` of entity uris with indices mapping to integer links in the markdown source.

### Preprocessers

The jsonml may be manipulated using preprocessors before it is translated into html.

```javascript
addAttributeToLinks = function ( jsonml ) {
  // Skip over anything that isn't a link
  if (jsonml[0] !== 'link') return jsonml;

  jsonml[1]['data-my-attribute'] = 'Hello World';

  return jsonml;
}

var markdown = require( "tent-markdown" ).markdown;
console.log( markdown.toHTML( "https://example.com", "Tent", { preprocessors: [addAttributeToLinks] } ) );
```

```html
<p><a href="https://example.com" data-my-attribute="Hello World">https://example.com</a></p>
```

## Contributing

1. Fork it
2. Create your feature branch (`git checkout -b my-new-feature`)
3. Commit your changes (`git commit -am 'Add some feature'`)
4. Push to the branch (`git push origin my-new-feature`)
5. Create new Pull Request
