
var facebook = {
  clientId: '1094807753900920',
  clientSecret: '3d4af261312493c4397e8003c9139500',
  token: null,
  user_info: null,

  getAuthURL(redirectURL) {
    return 'https://www.facebook.com/dialog/oauth?client_id=' + this.clientId +
           '&reponse_type=token&access_type=online' +
           '&redirect_uri=' + encodeURIComponent(redirectURL);
  },

  exchangeCodeForToken(code, redirectURL) {
    return new Promise((resolve, reject) => {
      let url = 'https://graph.facebook.com/oauth/access_token?' +
                'client_id=' + this.clientId +
                '&client_secret=' + this.clientSecret +
                '&redirect_uri=' + encodeURIComponent(redirectURL) +
                '&code=' + code;
      let xhr = new XMLHttpRequest();
      xhr.open('GET', url);
      xhr.onload = (e) => {
        let r = e.target;
        if (r.status === 200) {
          let response = JSON.parse('"'+r.responseText+'"');
          let params = parseParams(response);
          this.token = params.access_token;
          resolve(this.token);
        } else {
          reject([r.status, r.responseText]);
        }
      };
      xhr.onerror = (e) => {
        let r = e.target;
        let response = JSON.parse('"'+r.responseText+'"');
        reject([r.status, response]);
      };
      xhr.send(null);
    });
  },

  getUserInfo(interactive) {
    return new Promise((resolve, reject) => {
      if (this.user_info) {
        resolve(this.user_info);
        return;
      } else
      if (!interactive) {
        reject(new Error("user not logged in"));
        return;
      }
      xhrWithAuth(this, 'GET', 'https://graph.facebook.com/me', interactive).then(response => {
        this.user_info = JSON.parse(response.response);
        resolve(this.user_info);
      });
    });
  }
};


function parseSearchParams(redirectUri) {
  let paramRe = new RegExp('[#\?](.*)');
  let matches = redirectUri.match(paramRe);
  if (!matches || matches.length < 1)
    return {};
  return parseParams(matches[1].split("#")[0]);
}

function parseParams(searchParams) {
  let pairs = searchParams.split(/&/);
  let values = {};
  pairs.forEach(function(pair) {
    let nameval = pair.split(/=/);
    values[nameval[0]] = nameval[1];
  });
  return values;
}

function authorize(provider, interactive) {
  var redirectUri = chrome.identity.getRedirectURL('/provider_cb');

  return new Promise((resolve, reject) => {
    if (provider.token) {
      resolve(provider.token);
      return;
    }

    var options = {
      interactive: interactive,
      url: provider.getAuthURL(redirectUri)
    };

    chrome.identity.launchWebAuthFlow(options, function(redirectURL) {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError));
        return;
      }

      // #access_token={value}&refresh_token={value} or #code={value}
      let params = parseSearchParams(redirectURL);
      if (params.access_token) {
        provider.token = params.access_token;
        resolve(provider.token);
      } else if (params.code) {
        provider.exchangeCodeForToken(params.code, redirectUri).then((token) => {
          resolve(token);
        }).catch(error => {
          reject(new Error(error));
        });
      } else
        reject(new Error('Invalid response, no code or token: '+redirectURL));
    });
  });
}

function xhrWithAuth(provider, method, url, interactive) {
  return new Promise((resolve, reject) => {
    authorize(provider, interactive).then((token) => {
      let xhr = new XMLHttpRequest();
      xhr.open(method, url);
      xhr.setRequestHeader('Authorization', 'Bearer ' + token);
      xhr.onload = () => {
        if (xhr.status == 200) {
          resolve({ status: xhr.status, response: xhr.response });
        } else
          reject({ status: xhr.status, response: xhr.response });
      };
      xhr.onerror = () => {
        reject({ status: xhr.status, response: xhr.response });
      };
      xhr.send();
    });
  });
}


function notify(message) {
  switch(message.type) {
    case "getUserInfo":
      facebook.getUserInfo(message.interactive).then(user => {
        chrome.runtime.sendMessage({"user": user});
      });
      break;
    case "removeCachedToken":
      facebook.token = null;
      facebook.user_info = null;
      break;
  }
}
chrome.runtime.onMessage.addListener(notify);

function openPage() {
  chrome.tabs.create({
    "url": chrome.extension.getURL("index.html")
  });
}
chrome.browserAction.onClicked.addListener(openPage);