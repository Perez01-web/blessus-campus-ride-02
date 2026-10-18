/**
 * CampusRide API Client Helper
 * 
 * Centralizes backend communication with Firebase Auth token headers.
 */

import { auth } from './firebase-config.js';

async function getAuthHeaders() {
  const headers = {
    'Content-Type': 'application/json',
  };

  try {
    if (auth && auth.currentUser) {
      const token = await auth.currentUser.getIdToken();
      headers['Authorization'] = `Bearer ${token}`;
    }
  } catch (err) {
    console.warn('[API] Failed to get current user token:', err);
  }

  return headers;
}

export const api = {
  /**
   * Fetch available providers
   * @param {string} [type] - 'all' | 'taxi' | 'motorbike'
   */
  async getProviders(type = 'all') {
    const url = type && type !== 'all' 
      ? `/api/provider?type=${encodeURIComponent(type)}`
      : '/api/provider/all';
    
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to load providers (status ${res.status})`);
    }
    const json = await res.json();
    return json.data || [];
  },

  /**
   * Fetch single provider details
   * @param {string} providerId
   */
  async getProviderProfile(providerId) {
    const res = await fetch(`/api/provider/profile/${encodeURIComponent(providerId)}`);
    if (!res.ok) {
      throw new Error(`Failed to load provider profile (status ${res.status})`);
    }
    const json = await res.json();
    return json.data;
  },

  /**
   * Update provider profile
   * @param {string} providerId
   * @param {Object} data
   */
  async updateProviderProfile(providerId, data) {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/provider/profile/${encodeURIComponent(providerId)}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(data),
    });

    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.message || 'Failed to update profile');
    }
    return json;
  }
};
