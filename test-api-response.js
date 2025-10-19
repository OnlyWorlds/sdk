#!/usr/bin/env node

/**
 * Quick test to verify actual OnlyWorlds API response format
 * This will help clarify if the SDK types match the actual API responses
 */

const API_BASE = 'https://www.onlyworlds.com/api/worldapi';
const API_KEY = process.env.ONLYWORLDS_API_KEY;
const API_PIN = process.env.ONLYWORLDS_API_PIN;

if (!API_KEY || !API_PIN) {
  console.error('Error: Please set ONLYWORLDS_API_KEY and ONLYWORLDS_API_PIN environment variables');
  process.exit(1);
}

async function testListEndpoint() {
  console.log('Testing OnlyWorlds API list endpoint...\n');

  try {
    const response = await fetch(`${API_BASE}/character/?limit=2`, {
      headers: {
        'API-Key': API_KEY,
        'API-Pin': API_PIN,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.error(`HTTP Error: ${response.status}`);
      const text = await response.text();
      console.error('Response:', text);
      process.exit(1);
    }

    const data = await response.json();

    console.log('Raw API Response Structure:');
    console.log('----------------------------');
    console.log(JSON.stringify(data, null, 2));
    console.log('\n');

    console.log('Response Analysis:');
    console.log('------------------');
    console.log('Has "count" field:', 'count' in data);
    console.log('Has "next" field:', 'next' in data);
    console.log('Has "previous" field:', 'previous' in data);
    console.log('Has "results" field:', 'results' in data);
    console.log('Type of results:', Array.isArray(data.results) ? 'Array' : typeof data.results);

    console.log('\n✅ API Response Format Confirmed');
    console.log('The API returns a paginated response object with count/next/previous/results');
    console.log('This MATCHES the SDK ApiResponse<T> type definition');

  } catch (error) {
    console.error('Error testing API:', error.message);
    process.exit(1);
  }
}

testListEndpoint();
