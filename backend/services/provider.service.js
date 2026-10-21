/**
 * Provider Service
 * 
 * Handles all database operations related to the 'providers' collection.
 */

import { firestoreDb } from '../config/firebase-admin.js';

// In-memory fallback cache to ensure provider profiles function
// even when Firestore credentials are not configured or offline
const memoryProviders = new Map();

class ProviderService {
  /**
   * Initialize a default provider profile document
   * @param {string} providerId - Identifier (usually same as userId/uid)
   * @param {Object} data - Initial details
   */
  async createProviderProfile(providerId, data) {
    const existing = memoryProviders.get(providerId) || {};

    const profileData = {
      providerId: providerId,
      userId: data.userId || providerId,
      name: data.name !== undefined ? data.name : (existing.name || ''),
      providerType: data.providerType || existing.providerType || 'taxi',
      phone: data.phone !== undefined ? data.phone : (existing.phone || ''),
      vehicleName: data.vehicleName !== undefined ? data.vehicleName : (existing.vehicleName || ''),
      vehicleRegistration: data.vehicleRegistration !== undefined ? data.vehicleRegistration : (existing.vehicleRegistration || ''),
      price: data.price !== undefined ? (Number(data.price) || 0) : (existing.price || 0),
      estimatedWaitTime: data.estimatedWaitTime !== undefined ? (Number(data.estimatedWaitTime) || 10) : (existing.estimatedWaitTime || 10),
      available: data.available !== undefined ? Boolean(data.available) : (existing.available !== false),
      createdAt: existing.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    memoryProviders.set(providerId, profileData);

    if (firestoreDb) {
      try {
        const providerDocRef = firestoreDb.collection('providers').doc(providerId);
        await providerDocRef.set(profileData, { merge: true });
      } catch (err) {
        console.warn('[Provider Service] Firestore write warning (using fallback memory store):', err.message);
      }
    }

    return profileData;
  }

  /**
   * Get a provider profile by provider ID
   * @param {string} providerId
   * @returns {Object|null}
   */
  async getProviderProfile(providerId) {
    // 1. Try Firestore
    if (firestoreDb) {
      try {
        const providerDocRef = firestoreDb.collection('providers').doc(providerId);
        const docSnapshot = await providerDocRef.get();
        if (docSnapshot.exists) {
          const data = docSnapshot.data();
          memoryProviders.set(providerId, data);
          return data;
        }
      } catch (err) {
        console.warn('[Provider Service] Firestore read warning (falling back to memory store):', err.message);
      }
    }

    // 2. Try memory store
    if (memoryProviders.has(providerId)) {
      return memoryProviders.get(providerId);
    }

    // 3. Fallback: Provide a default initial profile so provider profile requests never crash
    const defaultProfile = {
      providerId: providerId,
      userId: providerId,
      name: 'Driver',
      providerType: 'taxi',
      phone: '',
      vehicleName: '',
      vehicleRegistration: '',
      price: 0,
      estimatedWaitTime: 10,
      available: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    memoryProviders.set(providerId, defaultProfile);
    return defaultProfile;
  }

  /**
   * Update provider profile details (vehicle, pricing, wait time, availability)
   * @param {string} providerId
   * @param {Object} updateData
   */
  async updateProviderProfile(providerId, updateData) {
    const existing = await this.getProviderProfile(providerId);

    const safeUpdates = {
      ...existing,
      updatedAt: new Date().toISOString(),
    };

    if (updateData.name !== undefined) safeUpdates.name = updateData.name.trim();
    if (updateData.phone !== undefined) safeUpdates.phone = updateData.phone.trim();
    if (updateData.providerType !== undefined) safeUpdates.providerType = updateData.providerType;
    if (updateData.vehicleName !== undefined) safeUpdates.vehicleName = updateData.vehicleName.trim();
    if (updateData.vehicleRegistration !== undefined) safeUpdates.vehicleRegistration = updateData.vehicleRegistration.trim();
    if (updateData.price !== undefined) safeUpdates.price = Number(updateData.price) || 0;
    if (updateData.estimatedWaitTime !== undefined) safeUpdates.estimatedWaitTime = Number(updateData.estimatedWaitTime) || 0;
    if (updateData.available !== undefined) safeUpdates.available = Boolean(updateData.available);
    if (updateData.availableUntil !== undefined) safeUpdates.availableUntil = updateData.availableUntil;

    memoryProviders.set(providerId, safeUpdates);

    if (firestoreDb) {
      try {
        const providerDocRef = firestoreDb.collection('providers').doc(providerId);
        await providerDocRef.set(safeUpdates, { merge: true });
      } catch (err) {
        console.warn('[Provider Service] Firestore update warning (saved to memory store):', err.message);
      }
    }

    return safeUpdates;
  }

  /**
   * Get all active & available providers with optional service type filter
   * @param {Object} filters - { providerType?: 'taxi' | 'motorbike' }
   * @returns {Array<Object>}
   */
  async getAvailableProviders(filters = {}) {
    const results = [];

    // 1. Try Firestore
    if (firestoreDb) {
      try {
        const query = firestoreDb.collection('providers');
        const snapshot = await query.get();
        const nowFs = Date.now();

        snapshot.forEach(docSnap => {
          const pData = docSnap.data();
          // Filter by availability (respect the auto-reappear after 'back at')
          if (pData.available === false) {
            const untilMs = pData.availableUntil ? new Date(pData.availableUntil).getTime() : NaN;
            const autoBack = !Number.isNaN(untilMs) && untilMs <= nowFs;
            if (!autoBack) {
              return;
            }
          }
          if (!filters.providerType || filters.providerType === 'all' || pData.providerType === filters.providerType) {
            results.push({ id: docSnap.id, ...pData });
          }
        });

        if (results.length > 0) {
          return results;
        }
      } catch (err) {
        console.warn('[Provider Service] Firestore query warning (using fallback memory store):', err.message);
      }
    }

    // 2. Query in-memory providers
    const nowMem = Date.now();
    for (const [id, provider] of memoryProviders.entries()) {
      if (provider.available === false) {
        const untilMs = provider.availableUntil ? new Date(provider.availableUntil).getTime() : NaN;
        const autoBack = !Number.isNaN(untilMs) && untilMs <= nowMem;
        if (!autoBack) {
          continue;
        }
      }
      if (!filters.providerType || filters.providerType === 'all' || provider.providerType === filters.providerType) {
        results.push({ id, ...provider });
      }
    }

    return results;
  }
}

export default new ProviderService();
