'use strict';

const createApplication = require('.');
const { AuthorizationCode } = require('..');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Store tokens in memory (in production, use a proper storage solution)
let storedTokens = null;

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
      
      // Store the tokens
      storedTokens = {
        access_token: accessToken.token.access_token,
        refresh_token: accessToken.token.refresh_token
      };

      console.log('Access Token:', storedTokens.access_token);
      console.log('Refresh Token:', storedTokens.refresh_token);

      return res.status(200).json(storedTokens);
    } catch (error) {
      console.error('Access Token Error', error.message);
      if (error.response) {
        console.error('Error response:', error.response.data);
      }
      return res.status(500).json('Authentication failed');
    }
  });

  // New endpoint to fetch clients using GraphQL
  app.get('/clients', async (req, res) => {
    if (!storedTokens || !storedTokens.access_token) {
      return res.status(401).json({ error: 'Not authenticated. Please login first.' });
    }

    const query = `
      query SampleQuery {
        clients {
          nodes {
            id
            firstName
            lastName
            billingAddress {
              city
            }
          }
          totalCount
        }
      }
    `;

    try {
      console.log('Making GraphQL request with token:', storedTokens.access_token.substring(0, 10) + '...');
      
      const response = await fetch('https://api.getjobber.com/api/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${storedTokens.access_token}`,
          'X-API-Version': '2024-04-02',
          'Origin': 'https://api.getjobber.com',
          'Referer': 'https://api.getjobber.com/',
          'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'include',
        body: JSON.stringify({ 
          query,
          variables: {},
          operationName: 'SampleQuery'
        })
      });

      console.log('Request URL:', 'https://api.getjobber.com/api/graphql');
      console.log('Request headers:', {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${storedTokens.access_token.substring(0, 10)}...`,
        'X-API-Version': '2024-04-02',
        'Origin': 'https://api.getjobber.com',
        'Referer': 'https://api.getjobber.com/',
        'X-Requested-With': 'XMLHttpRequest'
      });
      console.log('Request body:', JSON.stringify({ query, variables: {}, operationName: 'SampleQuery' }, null, 2));

      console.log('Response status:', response.status);
      console.log('Response headers:', response.headers.raw());
      const responseText = await response.text();
      console.log('Raw response:', responseText);
      
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        console.error('Failed to parse JSON response:', e);
        return res.status(500).json({ 
          error: 'Failed to parse API response', 
          details: responseText,
          status: response.status,
          headers: response.headers.raw()
        });
      }
      
      if (data.errors) {
        console.error('GraphQL Errors:', data.errors);
        return res.status(400).json({ errors: data.errors });
      }

      if (!data.data || !data.data.clients) {
        console.error('Unexpected response structure:', data);
        return res.status(500).json({ error: 'Unexpected response structure from API' });
      }

      return res.status(200).json(data.data);
    } catch (error) {
      console.error('Error fetching clients:', error);
      if (error.response) {
        console.error('Error response:', error.response.data);
      }
      return res.status(500).json({ error: 'Failed to fetch clients', details: error.message });
    }
  });

  app.get('/', (req, res) => {
    res.send(`
      <h1>GetJobber OAuth Demo</h1>
      <p><a href="/auth">Log in with GetJobber</a></p>
      ${storedTokens ? `<p><a href="/clients">View Clients</a></p>` : ''}
    `);
  });
});
