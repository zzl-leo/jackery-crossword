let BASE_URL = '';
let CR = '';
let timeout = null;

// 生产环境 接口域名
const prodUrl = "https://api.myjackery.com"
const awsProdUrl = "https://aws-gateway.hijackery.cn"
// uat环境 接口域名
const uatUrl = "https://api-uat.myjackery.com"
const awsUatUrl = "https://aws-gateway-uat.hijackery.cn"
// 开发环境 接口域名
const devUrl = "https://demo-api.myjackery.com"
const awsDevUrl = "https://10.1.74.145:8093"

if(!window.shopId) {
    window.shopId = '55005249633'
}
switch (window.shopId) {
  case "9709262": CR = "US"; BASE_URL = prodUrl; break;
  case "60738666677": CR = "CA"; BASE_URL = prodUrl; break;
  case "10015375438": CR = "JP"; BASE_URL = prodUrl; break;
  case "56981160124": CR = "GB"; BASE_URL = prodUrl; break;
  case "57272172741": CR = "DE"; BASE_URL = prodUrl; break;
  case "60455780502": CR = "KR"; BASE_URL = prodUrl; break;
  case "68984701213": CR = "AU"; BASE_URL = prodUrl; break;
  case "69511053598": CR = "FR"; BASE_URL = prodUrl; break;
  case "69224431898": CR = "IT"; BASE_URL = prodUrl; break;
  case "69013700929": CR = "ES"; BASE_URL = prodUrl; break;
  case "73356443969": CR = "EU"; BASE_URL = prodUrl; break;
  case "74688758050": CR = "HK"; BASE_URL = prodUrl; break;
  case "74914496810": CR = "MO"; BASE_URL = prodUrl; break;
  case "79611232554": CR = "US"; BASE_URL = uatUrl; break;
  
  default: CR = "US"; BASE_URL = devUrl; break;
}

const lang = document.querySelector("html").getAttribute("lang") || ""

const initial = {
  method: 'GET', params: null, body: null, cache: 'no-cache', credentials: 'include', responseType: 'JSON', mode: 'cors',
  headers: {
    cr: CR,
    lang
  }
};

function request(url, config, settings) {
  if (window.Shopify && window.Shopify.theme.role === "unpublished") {
    BASE_URL === prodUrl && (BASE_URL = uatUrl)
  }

  // riben ces 
  if(window.shopId === '10015375438') {
    BASE_URL = prodUrl
  }

  if (settings && settings.type == 'it-java') {
    BASE_URL = BASE_URL === prodUrl || BASE_URL === awsProdUrl ? awsProdUrl : BASE_URL === uatUrl || BASE_URL === awsUatUrl ? awsUatUrl : awsDevUrl
  } else {
    BASE_URL = BASE_URL === prodUrl || BASE_URL === awsProdUrl ? prodUrl : BASE_URL === uatUrl || BASE_URL === awsUatUrl ? uatUrl : devUrl
  }


  // init params
  if (typeof url !== 'string') throw new TypeError('url must be required and of string type');
  if (config && config.constructor === Object) {
    config = Object.assign(initial, config)
  } else {
    config = initial
  }
  let { method, params, body, headers, cache, credentials, responseType, check_jackery_token, } = config;

  // 处理URL：请求前缀 & 问号参数
  if (!/^http(s?):\/\//i.test(url)) { url = BASE_URL + url }
  if (params != null) {
    if (params.constructor === Object) {
      const values = Object.values(params);
      const keys = Object.keys(params);
      const arr = [];
      for (let i = 0; i < values.length; i++) {
        arr.push(`${keys[i]}=${values[i]}`)
      }
      params = arr.join("&")
    }
    url += `${url.includes('?') ? '&' : '?'}${params}`
  }

  // 根据自己的需求来:body传递的是普通对象，我们今天项目需要传递给服务器的是URLENCODED格式，我们才处理它的格式；如果用户传递的本身就不是普通对象(例如:文件流、字符串、FORM-DATA...)，还是以用户自己写的为主...
  if (body && body.constructor === Object) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  } else if (body && ((settings && settings.feature == 'upload') || body.constructor === File)) {
    // headers['Content-Type'] = 'multipart/form-data';
    if (headers['Content-Type'] == 'application/json') {
      delete headers['Content-Type']
    }
  } else if (typeof body === 'string') {
    try {
      // 是JSON字符串
      body = JSON.parse(body);
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    } catch (err) {
      // 不是JSON字符串:可以简单粗暴的按照URLECCODED格式字符串处理
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }
  }

  // 类似于AXIOS中的请求拦截器，例如：我们每一次发请求都需要携带TOKEN信息
  let token = "";
  if(check_jackery_token && check_jackery_token != "") {
    token = check_jackery_token;
  }
  if (token) {
    if(token.indexOf('+') > 0) {
      token = token.replace(/\+/g, '%2B');
    }

    if(token.indexOf('%2F') > 0) {
      token = token.replace('%2F', '/');
    }
    
    headers.jackeryToken = token
  }


  // jackery-life 三方代码 需要
  if (settings && settings.headers?.authorization) {
    headers.Authorization = settings.headers.authorization
  }


  // 把config配置成为fetch需要的对象
  config = {
    method: method.toUpperCase(), headers, credentials, cache
  };
  if (/^(POST|PUT|PATCH)$/i.test(method) && body != null) { config.body = body }

  // 发送请求
  return fetch(url, config).then((r) => {
    let { status, statusText } = r;
    // 只要状态码是以2或者3开始的，才是真正的获取成功
    if (status >= 200 && status < 400) {
      let result;
      switch (responseType.toUpperCase()) {
        case 'JSON': result = r.json(); break;
        case 'TEXT': result = r.text(); break;
        case 'BLOB': result = r.blob(); break;
        case 'ARRAYBUFFER': result = r.arrayBuffer(); break;
      }
      return result
    }
    return Promise.reject({ code: 'STATUS ERROR', status, statusText })
  }).then((r) => {
    // 处理OS接口和第三方接口的状态
    if (r.code || r.code >= 0) {
      switch (r.code) {
        case 200: return Promise.resolve(r);
        case 30001: case 30002:
          toast.warning("The Order ID does not exist, please try a different one.");
          return Promise.reject(r);
        case 50005:
          toast.warning("The email provided has been used.", 5000, 'red');
          return Promise.reject(r);
        default:
          return Promise.reject(r);
      }
    } else {
      return Promise.resolve(r)
    }
  }).catch((e) => {
    if (e && e.code === 'STATUS ERROR') {
      // @1 状态码错误
      switch (e.status) {
        case 400: break;
        case 401: break;
        case 404: break;
        case 50006: break;
        default: console.error("Oops, something went wrong, Please try again later."); break;
      }
    } else if (!navigator.onLine) {
      console.log("网络中断")
    }
    return Promise.reject(e)
  })
}

export const post = (url, body, settings) => request(url, { method: 'POST', body }, settings);

export const get = (url, params, settings) => request(url, { method: 'GET', params, }, settings);

export const shopCR = CR;

// email电话订阅
export const footerPhoneSubs = (params) => post("/v1/notice/subscribe", { shopify_shop_id: shopId, ...params });
