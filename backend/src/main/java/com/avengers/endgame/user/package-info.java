/**
 * Trading identities keyed by the auth JWT subject UUID. These entities contain no
 * password or refresh token. CurrentUserService creates normal client identities on
 * first use; UserController is a separate ADMIN-only management route. The trading
 * role supports local integrity constraints, while signed auth roles authorize APIs.
 */
package com.avengers.endgame.user;
