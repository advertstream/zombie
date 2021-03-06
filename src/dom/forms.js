// Patches to JSDOM for properly handling forms.
const DOM   = require('./index');
const File  = require('fs');
const Mime  = require('mime');
const Path  = require('path');


// The Form
// --------

// Forms convert INPUT fields of type file into this object and pass it as
// parameter to resource request.
//
// The base class is a String, so the value (e.g. when passed in a GET request)
// is the base filename.  Additional properties include the MIME type (`mime`),
// the full filename (`filename`) and the `read` method that returns the file
// contents.
function uploadedFile(filename) {
  const file    = new String(Path.basename(filename)); // jshint ignore:line
  file.filename = filename;
  file.mime     = Mime.lookup(filename);
  file.read     = function() {
    return File.readFileSync(filename);
  };
  return file;
}


// Implement form.submit such that it actually submits a request to the server.
// This method takes the submitting button so we can send the button name/value.
DOM.HTMLFormElement.prototype.submit = function(button) {
  const form      = this;
  const document  = form.ownerDocument;
  const params    = {};

  function process(index) {
    const field = form.elements.item(index);
    if (!field) {
      submit();
      return;
    }

    const name = field.getAttribute('name');
    if (!field.getAttribute('disabled') && name) {
      if (field.nodeName === 'SELECT') {
        const selected = [...field.options]
          .filter(option  => option.selected)
          .map(options    => options.value);

        if (field.multiple) {
          params[name] = (params[name] || []).concat(selected);
        } else {
          const value = (selected.length > 0) ?
            selected[0] :
            (field.options.length && field.options[0].value);
          params[name] = params[name] || [];
          params[name].push(value);
        }
      } else if (field.nodeName === 'INPUT' && (field.type === 'checkbox' || field.type === 'radio')) {
        if (field.checked) {
          params[name] = params[name] || [];
          params[name].push(field.value || '1');
        }
      } else if (field.nodeName === 'INPUT' && field.type === 'file') {
        if (field.value) {
          params[name] = params[name] || [];
          params[name].push(uploadedFile(field.value));
        }
      } else if (field.nodeName === 'TEXTAREA' || field.nodeName === 'INPUT') {
        if (field.type !== 'submit' && field.type !== 'image') {
          params[name] = params[name] || [];
          params[name].push(field.value || '');
        }
      }
    }

    process(index + 1);
  }

  function submit() {
    // No triggering event, just get history to do the submission.
    if (button && button.name) {
      params[button.name] = params[button.name] || [];
      params[button.name].push(button.value);
    }

    // Ask window to submit form, let it figure out how to handle this based on
    // the target attribute.
    document.window._submit({
      url:      form.getAttribute('action') || document.location.href,
      method:   form.getAttribute('method') || 'GET',
      encoding: form.getAttribute('enctype'),
      params:   params,
      target:   form.getAttribute('target')
    });
  }

  process(0);
};



// Replace dispatchEvent so we can send the button along the event.
DOM.HTMLFormElement.prototype._dispatchSubmitEvent = function(button) {
  const event = this.ownerDocument.createEvent('HTMLEvents');
  event.initEvent('submit', true, true);
  event._button = button;
  return this.dispatchEvent(event);
};


// Default behavior for submit events is to call the form's submit method, but we
// also pass the submitting button.
DOM.HTMLFormElement.prototype._eventDefaults.submit = function(event) {
  event.target.submit(event._button);
};


// Buttons
// -------

// Default behavior for clicking on inputs.
DOM.HTMLInputElement.prototype._eventDefaults =
  Object.assign({}, DOM.HTMLElement.prototype._eventDefaults)
DOM.HTMLInputElement.prototype._eventDefaults.click = function(event) {
  const input = event.target;

  function change() {
    const event = input.ownerDocument.createEvent('HTMLEvents');
    event.initEvent('change', true, true);
    input.dispatchEvent(event);
  }

  switch (input.type) {
    case 'reset': {
      if (input.form)
        input.form.reset();
      break;
    }
    case 'submit': {
      if (input.form)
        input.form._dispatchSubmitEvent(input);
      break;
    }
    case 'image': {
      if (input.form)
        input.form._dispatchSubmitEvent(input);
      break;
    }
    case 'checkbox': {
      change();
      break;
    }
    case 'radio': {
      if (!input.getAttribute('readonly')) {
        input.checked = true;
        change();
      } 
    }
  }
};



// Current INPUT behavior on click is to capture sumbit and handle it, but
// ignore all other clicks. We need those other clicks to occur, so we're going
// to dispatch them all.
DOM.HTMLInputElement.prototype.click = function() {
  const input = this;
  input.focus();

  // First event we fire is click event
  function click() {
    const event = input.ownerDocument.createEvent('HTMLEvents');
    event.initEvent('click', true, true);
    return input.dispatchEvent(event);
  }

  switch (input.type) {
    case 'checkbox': {
      if (!input.getAttribute('readonly')) {
        const original    = input.checked;
        input.checked     = !original;
        const checkResult = click();
        if (checkResult === false)
          input.checked = original;
      }
      break;
    }

    case 'radio': {
      if (!input.getAttribute('readonly')) {
        if (input.checked) {
          click();
        } else {
          const radios = input.ownerDocument.querySelectorAll(`input[type=radio][name='${this.getAttribute('name')}']`);
          const checked = [...radios]
            .filter(radio   => radio.checked && radio.form === this.form )
            .map(radio  => {
              radio.checked = false;
            })[0];

          input.checked = true;
          const radioResult = click();
          if (radioResult === false) {
            input.checked = false;
            [...radios]
              .filter(radio   => radio.form === input.form )
              .forEach(radio  => {
                radio.checked = (radio == checked);
              });
          }
        }
      }
      break;
    }
    
    default: {
      click();
      break;
    }
  }
};


// Default behavior for form BUTTON: submit form.
DOM.HTMLButtonElement.prototype._eventDefaults.click = function(event) {
  const button = event.target;
  if (button.getAttribute('disabled')) {
    return;
  } else {
    const form = button.form;
    if (form)
      return form._dispatchSubmitEvent(button);
  }
};

