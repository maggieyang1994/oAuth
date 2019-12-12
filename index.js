const dotenv = require('dotenv').config();
const express = require('express');
const app = express();
const crypto = require('crypto');
const cookie = require('cookie');
const nonce = require('nonce')();
const querystring = require('querystring');
const request = require('request-promise');
const axios = require("axios")
const url = 'https://0bdd9097.ngrok.io/shopify?shop=maggieTestStore1.myshopify.com'
const apiKey = process.env.SHOPIFY_API_KEY;
const apiSecret = process.env.SHOPIFY_API_SECRET;
const scopes = 'read_products';
const forwardingAddress = "https://0bdd9097.ngrok.io"; // Replace this with your HTTPS Forwarding address
// clientID 和 clientSecret 只是为了让系统知道是谁 访问了我 并不是github的username password
// Client ID 和 Client secret 就是这个应用的身份识别码
// 是用户自己生成的
const clientID = 'Iv1.dce8fb1c57aacde3';
const clientSecret = '1ac7d5971c4adb466af6177d3cbd28ba197b6135'
const githubUrl = "https://github.com/login/oauth/authorize?client_id=Iv1.dce8fb1c57aacde3&redirect_uri=https://0bdd9097.ngrok.io/github/callback"
app.get('/', (req, res) => {
  res.send('Hello World!');
});
app.get('/github', (req, res) => {
  console.log(req.query)
})
app.get('/github/callback',async(req, res) => {
  console.log(req.query);
  let requestToken = req.query.code;
  const tokenResponse = await axios({
    method: 'post',
    url: 'https://github.com/login/oauth/access_token?' +
      `client_id=${clientID}&` +
      `client_secret=${clientSecret}&` +
      `code=${requestToken}`,
    headers: {
      accept: 'application/json'
    }
  });
  console.log(tokenResponse)
  const accessToken = tokenResponse.data.access_token;
  console.log(`access token: ${accessToken}`);

  const result = await axios({
    method: 'get',
    url: `https://api.github.com/user`,
    headers: {
      accept: 'application/json',
      Authorization: `token ${accessToken}`
    }
  });
  console.log(result.data);
  const name = result.data.name;
  // axios.post({
  //   url: "https://github.com/login/oauth/access_token"
  // })
})
app.get('/github/webhook', (req, res) => {
  console.log(req.query)
})
app.get('/shopify', (req, res) => {
  const shop = req.query.shop;
  if (shop) {
    const state = nonce();
    const redirectUri = forwardingAddress + '/shopify/callback';
    const installUrl = 'https://' + shop +
      '/admin/oauth/authorize?client_id=' + apiKey +
      '&scope=' + scopes +
      '&state=' + state +
      '&redirect_uri=' + redirectUri;

    res.cookie('state', state);
    // 要求用户登录  登陆成功 之后调到 redirectUri
    res.redirect(installUrl);
  } else {
    return res.status(400).send('Missing shop parameter. Please add ?shop=your-development-shop.myshopify.com to your request');
  }
});
app.get('/shopify/callback', (req, res) => {
  // 用户登录成功之后  到这个路由  req.query　中有授权码
  const { shop, hmac, code, state } = req.query;
  console.log(shop, hmac, code, state)
  const stateCookie = cookie.parse(req.headers.cookie).state;

  if (state !== stateCookie) {
    return res.status(403).send('Request origin cannot be verified');
  }

  if (shop && hmac && code) {
    const map = Object.assign({}, req.query);
    delete map['signature'];
    delete map['hmac'];
    const message = querystring.stringify(map);
    const providedHmac = Buffer.from(hmac, 'utf-8');
    const generatedHash = Buffer.from(
      crypto
        .createHmac('sha256', apiSecret)
        .update(message)
        .digest('hex'),
      'utf-8'
    );
    let hashEquals = false;
    // timingSafeEqual will prevent any timing attacks. Arguments must be buffers
    try {
      hashEquals = crypto.timingSafeEqual(generatedHash, providedHmac)
      // timingSafeEqual will return an error if the input buffers are not the same length.
    } catch (e) {
      hashEquals = false;
    };

    if (!hashEquals) {
      return res.status(400).send('HMAC validation failed');
    }
    // client_id参数和client_secret参数用来让 B 确认 A 的身份（client_secret参数是保密的，因此只能在后端发请求）
    const accessTokenRequestUrl = 'https://' + shop + '/admin/oauth/access_token';
    const accessTokenPayload = {
      client_id: apiKey,
      client_secret: apiSecret,
      code,
    };

    request.post(accessTokenRequestUrl, { json: accessTokenPayload })
      .then((accessTokenResponse) => {
        const accessToken = accessTokenResponse.access_token;


        let url = `https://${shop}/admin/api/2019-10/products.json`
        return axios({
          method: 'get',
          url,
          headers: {
            'Authorization': 'token ' + accessToken
          },
        }).then(res => {
          console.log('sucess', res)
        }).catch(e => {
          console.log('error', e)
        })
        // TODO
        // Use access token to make API call to 'shop' endpoint
      })
      .catch((error) => {
        res.status(error.statusCode).send(error.error.error_description);
      });
  } else {
    res.status(400).send('Required parameters missing');
  }
});
app.listen(4000, () => {
  console.log('Example app listening on port 4000!');
});