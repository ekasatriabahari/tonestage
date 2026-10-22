package com.tonestage.app.yi

/** [code] is a stable machine-readable value; the JavaScript side maps it to an Indonesian message. */
class YiControlException(val code: String, message: String) : Exception(message)