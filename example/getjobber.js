'use strict';

const express = require('express');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

// API Configuration
const API_CONFIG = {
  baseUrl: 'https://api.getjobber.com',
  endpoints: {
    authorize: '/api/oauth/authorize',
    token: '/api/oauth/token',
    graphql: '/api/graphql'
  }
};

// Store tokens in memory (in production, use a proper storage solution)
let storedTokens = null;

const port = 3000;
const callbackUrl = 'http://localhost:3000/callback';

// Initialize Express app
const app = express();

// Initial page redirecting to GetJobber
app.get('/auth', (req, res) => {
  const authUrl = new URL(API_CONFIG.endpoints.authorize, API_CONFIG.baseUrl);
  authUrl.searchParams.append('response_type', 'code');
  authUrl.searchParams.append('client_id', process.env.CLIENT_ID);
  authUrl.searchParams.append('redirect_uri', callbackUrl);
  authUrl.searchParams.append('scope', 'notifications');
  authUrl.searchParams.append('state', '3(#0/!~');

  console.log('Authorization URL:', authUrl.toString());
  res.redirect(authUrl.toString());
});

// Callback service parsing the authorization token and asking for the access token
app.get('/callback', async (req, res) => {
  const { code } = req.query;

  try {
    const tokenResponse = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.token}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: callbackUrl,
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET
      })
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('Token Error Response:', errorData);
      throw new Error(`Token request failed with status ${tokenResponse.status}`);
    }

    const tokenData = await tokenResponse.json();

    // Store the tokens - only include properties that exist in the response
    storedTokens = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token
    };

    console.log('Access Token:', storedTokens.access_token);
    console.log('Refresh Token:', storedTokens.refresh_token);

    return res.status(200).json(storedTokens);
  } catch (error) {
    console.error('Access Token Error:', error.message);
    return res.status(500).json('Authentication failed');
  }
});

// New endpoint to fetch clients using GraphQL
app.get('/clients', async (req, res) => {
  if (!storedTokens || !storedTokens.access_token) {
    return res.status(401).json({ error: 'Not authenticated. Please login first.' });
  }

  // Simpler query to test basic connectivity
  const query = `
    query {
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

    const response = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.graphql}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': '*/*',
        'Authorization': `Bearer ${storedTokens.access_token}`,
        'X-JOBBER-GRAPHQL-VERSION': '2025-01-20'
      },
      body: JSON.stringify({ query }),
    });

    console.log('Request URL:', `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.graphql}`);
    console.log('Request headers:', {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${storedTokens.access_token.substring(0, 10)}...`,
      'X-API-Version': '2024-04-02'
    });
    console.log('Request body:', JSON.stringify({ query }));

    console.log('Response status:', response.status);
    console.log('Response headers:', response.headers.raw());
    const responseText = await response.text();
    console.log('Raw response:', responseText);

    // Check if the response indicates an authentication error
    if (response.status === 401) {
      return res.status(401).json({
        error: 'Authentication failed',
        details: 'The access token may be invalid or expired. Please try re-authenticating.'
      });
    }

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

    if (!data.data) {
      console.error('Unexpected response structure:', data);
      return res.status(500).json({ error: 'Unexpected response structure from API' });
    }

    return res.status(200).json(data.data);
  } catch (error) {
    console.error('Error fetching account:', error);
    if (error.response) {
      console.error('Error response:', error.response.data);
    }
    return res.status(500).json({
      error: 'Failed to fetch account data',
      details: error.message,
      stack: error.stack
    });
  }
});

app.get('/', (req, res) => {
  res.send(`
    <h1>GetJobber OAuth Demo</h1>
    <p><a href="/auth">Log in with GetJobber</a></p>
    ${storedTokens ? `<p><a href="/clients">View Clients</a></p>` : ''}
  `);
});

// Start the server
app.listen(port, (err) => {
  if (err) return console.error(err);
  console.log(`Express server listening at http://localhost:${port}`);
});
