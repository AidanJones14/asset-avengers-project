/**
 * Persistent user stars. WatchlistController derives identity from the JWT and
 * WatchlistService locks the user while creating/changing its list. Unique list/user
 * and list/instrument keys make repeat requests safe. Portfolio snapshots return
 * symbols; starring a catalogue instrument never purchases shares or fetches a quote.
 */
package com.avengers.endgame.watchlist;
