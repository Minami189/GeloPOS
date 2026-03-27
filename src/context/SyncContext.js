import React, { createContext, useContext, useState, useCallback } from 'react';

const SyncContext = createContext(null);

/**
 * Provides a global "sync counter" that increments every time a sync
 * completes. Any screen that reads `syncEpoch` will re-run its data
 * loading logic automatically when the counter changes.
 */
export function SyncProvider({ children }) {
    const [syncEpoch, setSyncEpoch] = useState(0);

    const notifySynced = useCallback(() => {
        setSyncEpoch(prev => prev + 1);
    }, []);

    return (
        <SyncContext.Provider value={{ syncEpoch, notifySynced }}>
            {children}
        </SyncContext.Provider>
    );
}

export function useSyncContext() {
    const ctx = useContext(SyncContext);
    if (!ctx) throw new Error('useSyncContext must be used within a SyncProvider');
    return ctx;
}
