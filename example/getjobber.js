'use strict';

const createApplication = require('.');
const { AuthorizationCode } = require('..');

createApplication(({ app, callbackUrl }) => {
  const client = new AuthorizationCode({
    client: {
      id: process.env.CLIENT_ID,
      secret: process.env.CLIENT_SECRET,
    },
    auth: {
      tokenHost: 'https://api.getjobber.com',
      tokenPath: '/api/oauth/token',
      authorizePath: '/api/oauth/authorize',
    },
    options: {
      bodyFormat: 'form',
      authorizationMethod: 'body'
    }
  });

  // Authorization uri definition
  const authorizationUri = client.authorizeURL({
    redirect_uri: callbackUrl,
    scope: 'notifications',
    state: '3(#0/!~',
  });

  // Initial page redirecting to GetJobber
  app.get('/auth', (req, res) => {
    console.log(authorizationUri);
    res.redirect(authorizationUri);
  });

  // Callback service parsing the authorization token and asking for the access token
  app.get('/callback', async (req, res) => {
    const { code } = req.query;
    const options = {
      code,
      redirect_uri: callbackUrl,
      grant_type: 'authorization_code'
    };

    try {
      console.log('fetching token with options:', options);
      const accessToken = await client.getToken(options);

      console.log('The resulting token: ', accessToken.token);

      return res.status(200).json(accessToken.token);
    } catch (error) {
      console.error('Access Token Error', error.message);
      if (error.response) {
        console.error('Error response:', error.response.data);
      }
      return res.status(500).json('Authentication failed');
    }
  });

  app.get('/', (req, res) => {
    res.send('Hello<br><a href="/auth">Log in with GetJobber</a>');
  });
});
