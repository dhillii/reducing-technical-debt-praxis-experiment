char asciiEsc = 0;
	    if (("dswDSW".indexOf(pattern[index]) != -1) && syntax.get(RESyntax.RE_CHAR_CLASS_ESC_IN_LISTS)) {
	      switch (pattern[index]) {
	      case 'D':
		negate = true;
		break;
	      case 'd':
		posixID = RETokenPOSIX.DIGIT;
		break;
	      case 'S':
		negate = true;
		break;
	      case 's':
		posixID = RETokenPOSIX.SPACE;
		break;
	      case 'W':
		negate = true;
		break;
	      case 'w':
		posixID = RETokenPOSIX.ALNUM;
		break;
	      }
	    }