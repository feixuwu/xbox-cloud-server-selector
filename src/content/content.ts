import { IpVersionInterceptor } from "./interceptors/ipVersioninterceptor";
import { RegionInterceptor } from "./interceptors/regionInterceptor";
import { Settings } from "./settings";
import { log } from "../logger";

// We cannot use chrome.runtime.onMessage here, because it doesn't exist in this scope
window.addEventListener("message", (event) => {
  if (event.data.from != "xbox-cloud-server-selector") return;  

  load(event.data.settings);
});

const regionIps = {
  "Australia": "203.41.44.20",
  "Brazil": "200.221.11.101",
  "Europe": "194.25.0.68",
  "Japan": "122.1.0.154",
  "Korea": "203.253.64.1",
  "United States": "4.2.2.2"
};

let forwardedIp = "4.2.2.2"; // xgpuweb.gssv-play-prod.xboxlive.com/v2/login/user

log("Settings listener alive");

function checkCorsAllowed(url:string) {
  return (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("://")) === false;
}

function checkCorsWhitelistAllowed(url:string) {
  return (url.indexOf('://xgpuweb.gssv-play-prod.xboxlive.com') > -1 || url.indexOf('://www.xbox.com') > -1);
}


function checkCorsAllAllowed(url:string) {
  if (url.indexOf('://xgpuweb.gssv-play-prod.xboxlive.com') > -1) {
      //removeHeaderNavBar();
  }
  return (checkCorsAllowed(url) || checkCorsWhitelistAllowed(url));
}

function buildInjectedHeader(headers:Headers) {
  if (!headers){
      headers = new Headers();
  }
  headers.set("X-Forwarded-For", forwardedIp);
  return headers;
}

function load(settings: Settings) {
  log("Received settings:", settings);

  const { fetch: originalFetch } = window;
  window.fetch = async (...args) => {
    var first_arg:any = args[0];
    var second_arg:any = args[1];
    switch(typeof(args[0])) {
      case "string":
        if (checkCorsAllAllowed(first_arg)) {
            if (!args[1]) {
                args[1] = {};
            }
            try {
              second_arg.headers = buildInjectedHeader(second_arg.headers);
            } catch {}
        }
        break;
      case "object":
        if (checkCorsAllAllowed(first_arg.url)) {
            try {
              first_arg.headers = buildInjectedHeader(first_arg.headers);
            } catch {}
            buildInjectedHeader(first_arg.headers);
        }
        break;
      default:
        break;
    }

    const [resource, config] = args;
    const response = await originalFetch(resource, config);

    const interceptors = [new RegionInterceptor(), new IpVersionInterceptor()];

    for (const interceptor of interceptors) {
      const needInterception =
        resource instanceof Request &&
        resource.method == interceptor.requestPattern.method &&
        interceptor.requestPattern.urlPattern.test(resource.url);

      if (!needInterception) continue;

      log(`Intercepted call to ${resource.url}`);
      return await interceptor.intercept(settings, response);
    }

    return response;
  };
}
