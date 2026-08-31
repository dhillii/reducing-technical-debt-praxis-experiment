parts, preferably using reflection.

		// Check the cache
		if (classCache != null) {
			c =	(Class)classCache.get(name);

			if ( c != null )
				return c;
		}
			
		// Unqualified name check imported
		if ( unqualifiedName ) {
			c = getImportedClassImpl( name );

			// if found as imported also cache it
			if ( c != null ) {
				cacheClass( c );
				return c;
			}
		}

		// Try absolute
		c = classForName( name );
		if ( c != null ) {
			// Cache unqualified names to prevent import check again
			if ( unqualifiedName )
				cacheClass( c );
			return c;
		}

		// Not found
		Interpreter.debug("getClass(): " + name	+ " not	found in "+this);
		return null;
    }

	/**
		Try to make the name into an imported class.
		This method takes into account only imports (class or package)
		found directly in this NameSpace (no parent chain).
	*/
    private Class getImportedClassImpl( String name )
		throws ClassPathException
    {
		// Try explicitly imported class, e.g. import foo.Bar;
		String fullname = null;
		if ( importedClasses != null )
			fullname = (String)importedClasses.get(name);

		if ( fullname != null ) 
		{
			/*
				Found the full name in imported classes.
			*/
			// Try to make the full imported name
			Class clas=classForName(fullname);
			
			// Handle imported inner class case
			if ( clas == null ) 
			{
				// Imported full name wasn't found as an absolute class
				// If it is compound, try to resolve to an inner class.  
				// (maybe this should happen BshClassManager?)

				if ( Name.isCompound( fullname ) )
					try {
						clas = getNameResolver( fullname ).toClass();
					} catch ( EvalError e ) { /* not a class */ }
				else 
					Interpreter.debug(
						"imported unpackaged name not found:" +fullname);

				// If found cache the full name in BshClassManager
				if ( clas != null ) {
					// (should we cache info in not a class case too?)
					BshClassManager.cacheClassInfo( fullname, clas );
					return clas;
				}
			} else
				return clas;

			// It was explicitly imported, but we don't know what it is.
			// should we throw an error here??
			return null;  
		}

		/*
			Try imported packages, e.g. "import foo.bar.*;"
			in reverse order of import...
			(give later imports precedence...)
		*/
		if ( importedPackages != null )
			for(int i=importedPackages.size()-1; i>=0; i--)
			{
				String s = ((String)importedPackages.elementAt(i)) + "." + name;
				Class c=classForName(s);
				if ( c != null )
					return c;
			}

		/*
			Try super imported if available
			Note: we do this last to allow explicitly imported classes
			and packages to take priority.  This method will also throw an
			error indicating ambiguity if it exists...
		*/
		if ( superImport ) 
		{
			BshClassManager bcm = BshClassManager.getClassManager();
			if ( bcm != null ) {
				String s = bcm.getClassNameByUnqName( name );
				if ( s != null )
					return classForName( s );
			}
		}

		return null;
    }

	private Class classForName( String name ) 
	{
		return BshClassManager.classForName( name );
	}

	/**
		Implements NameSource
		@return all class and variable names in this and all parent
		namespaces
	*/
	public String [] getAllNames() 
	{
		Vector vec = new Vector();
		getAllNamesAux( vec );
		String [] names = new String [ vec.size() ];
		vec.copyInto( names );
		return names;
	}

	/**
		Helper for implementing NameSource
	*/
	protected void getAllNamesAux( Vector vec ) 
	{
		Enumeration varNames = variables.keys();
		while( varNames.hasMoreElements() )
			vec.addElement( varNames.nextElement() );

		Enumeration methodNames = methods.keys();
		while( methodNames.hasMoreElements() )
			vec.addElement( methodNames.nextElement() );

		if ( parent != null )
			parent.getAllNamesAux( vec );
	}

	Vector nameSourceListeners;
	/**
		Implements NameSource
		Add a listener who is notified upon changes to names in this space.
	*/
	public void addNameSourceListener( NameSource.Listener listener ) {
		if ( nameSourceListeners == null )
			nameSourceListeners = new Vector();
		nameSourceListeners.addElement( listener );
	}
	
	/**
		Perform "import *;" causing the entire classpath to be mapped.
		This can take a while.
	*/
	public static void doSuperImport() 
		throws EvalError
	{
		BshClassManager bcm = BshClassManager.getClassManager();
		if ( bcm != null )
			bcm.doSuperImport();
		superImport = true;
	}

    static class TypedVariable implements java.io.Serializable 
	{
		Class type;
		Object value = null; // uninitiailized
		boolean	isFinal;

		TypedVariable(Class type, Object value,	boolean	isFinal)
			throws EvalError
		{
			this.type =	type;
			if ( type == null )
				throw new InterpreterError("null type in typed var: "+value);
			this.isFinal = isFinal;
			setValue( value );
		}

		/**
			Set the value of the typed variable.
		*/
		void setValue(Object val) throws EvalError
		{
			if ( isFinal && value != null )
				throw new EvalError ("Final variable, can't assign");

			// do basic assignability check
			val = getAssignableForm(val, type);
			
			// If we are a numeric primitive type we want to convert to the 
			// actual numeric type of this variable...  Being assignable is 
			// not good enough.
			if ( val instanceof Primitive && ((Primitive)val).isNumber() )
				try {
					val = BSHCastExpression.castPrimitive( 
						(Primitive)val, type );
				} catch ( EvalError e ) {
					throw new InterpreterError("auto assignment cast failed");
				}

			this.value= val;
		}

		Object getValue() { return value; }

		Class getType() { return type;	}

		public String toString() { 
			return "TypedVariable: "+type+", value:"+value;
		}
    }

	/**
		@deprecated name changed.
		@see getAssignableForm()
	*/
    public static Object checkAssignableFrom(Object rhs, Class lhsType)
		throws EvalError
    {
		return getAssignableForm( rhs, lhsType );
	}

	/**
		<p>
		Determine if the RHS object can be assigned to the LHS type (as is,
		through widening, promotion, etc. ) and if so, return the 
		assignable form of the RHS.  Note that this is *not* a cast operation.
		Only assignments which are always legal (upcasts, promotion) are 
		passed.
		<p>

		In normal cases this functions as a simple check for assignability
		and the value is returned unchanged.  e.g. a String is assignable to
		an Object, but no conversion is necessary.  Similarly an int is 
		assignable to a long, so no conversion is done.
		In this sense assignability is in terms of what the Java reflection API
		will allow since the reflection api will do widening conversions in the 
		case of sets on fields and arrays.
		<p>
		The primary purpose of the abstraction "returning the assignable form"			abstraction is to allow non standard bsh assignment conversions. e.g.
		the wrapper stuff.  I'm still not sure how much of that we should
		be doing.
		<p>

		This method is used in many places throughout bsh including assignment
		operations and method selection.
		<p>

		@returns an assignable form of the RHS or throws EvalError
		@throws EvalError on non assignable
		@see BSHCastExpression.castObject();
	*/
	/*
		Notes:
	
		Need to define the exact behavior here:
			Does this preserve Primitive types to Primitives, etc.?

		This is very confusing in general...  need to simplify and clarify the
		various places things are happening:
			Reflect.isAssignableFrom()
			Primitive?
			here?
	*/
    public static Object getAssignableForm( Object rhs, Class lhsType )
		throws EvalError
    {
		Class originalType;

		if ( lhsType == null )
			throw new InterpreterError(
				"Null value for type in getAssignableForm");

		if(rhs == null)
			throw new InterpreterError("Null value in getAssignableForm.");

		if(rhs == Primitive.VOID)
			throw new EvalError( "Undefined variable or class name");

		if (rhs == Primitive.NULL)
			if(!lhsType.isPrimitive())
				return rhs;
			else
				throw new EvalError(
					"Can't assign null to primitive type " + lhsType.getName());

		Class rhsType;

		if ( rhs instanceof Primitive ) 
		{
			// set the rhsType to the type of the primitive
			rhsType = originalType = ((Primitive)rhs).getType();

			// check for primitive/non-primitive mismatch
			if ( lhsType.isPrimitive() ) {
				// not doing this yet...  leaving as the assignable orig type
				/*
					We have two primitive types.  If Reflect.isAssignableFrom()
					which knows about primitive widening conversions says they
					are assignable, we will do a cast to change the value
				if ( Reflect.isAssignableFrom(
					((Primitive)lhs).getType(), ((Primitive)rhs).getType() )
				*/
			} else
			{
				// attempt promotion to	a primitive wrapper
				// if lhs a wrapper type, get the rhs as wrapper value
				// else error
				if( Boolean.class.isAssignableFrom(lhsType) ||
					Character.class.isAssignableFrom(lhsType) ||
					Number.class.isAssignableFrom(lhsType) )
				{
					rhs	= ((Primitive)rhs).getValue();
					// type is the wrapper class type
					rhsType = rhs.getClass();
				}
				else
					assignmentError(lhsType, originalType);
			}
		} else 
		{
			// set the rhs type
			rhsType = originalType = rhs.getClass();

			// check for primitive/non-primitive mismatch
			if ( lhsType.isPrimitive() ) {

				// attempt unwrapping wrapper class for assignment 
				// to a primitive

				if (rhsType == Boolean.class)
				{
					rhs	= new Primitive((Boolean)rhs);
					rhsType = Boolean.TYPE;
				}
				else if (rhsType == Character.class)
				{
					rhs	= new Primitive((Character)rhs);
					rhsType = Character.TYPE;
				}
				else if (Number.class.isAssignableFrom(rhsType))
				{
					rhs	= new Primitive((Number)rhs);
					rhsType = ((Primitive)rhs).getType();
				}
				else
					assignmentError(lhsType, originalType);
			}
		}

		// This handles both class types and primitive .TYPE types
		if ( Reflect.isAssignableFrom(lhsType, rhsType) )
			return rhs;

		/* 
			bsh extension -
			Attempt widening conversions as defined in JLS 5.1.2
			except perform them on primitive wrapper objects.
		*/
		if(lhsType == Short.class)
			if(rhsType == Byte.class)
				return new Short(((Number)rhs).shortValue());

		if(lhsType == Integer.class) {
			if(rhsType == Byte.class || rhsType == Short.class)
				return new Integer(((Number)rhs).intValue());

			if(rhsType == Character.class)
				return new Integer(((Number)rhs).intValue());
		}

		if(lhsType == Long.class) {
			if(rhsType == Byte.class || rhsType == Short.class ||
				rhsType == Integer.class)
				return new Long(((Number)rhs).longValue());

			if(rhsType == Character.class)
				return new Long(((Number)rhs).longValue());
		}

		if(lhsType == Float.class) {
			if(rhsType == Byte.class || rhsType == Short.class ||
				rhsType == Integer.class ||	rhsType	== Long.class)
				return new Float(((Number)rhs).floatValue());

			if(rhsType == Character.class)
				return new Float(((Number)rhs).floatValue());
		}

		if(lhsType == Double.class) {
			if(rhsType == Byte.class || rhsType == Short.class ||
				rhsType == Integer.class ||	rhsType	== Long.class ||
				rhsType == Float.class)
				return new Double(((Number)rhs).doubleValue());

			if(rhsType == Character.class)
				return new Double(((Number)rhs).doubleValue());
		}

		/*
			Bsh This objects may be able to use the proxy mechanism to 
			become an LHS type.
		*/
		if ( Capabilities.canGenerateInterfaces() && 
			lhsType.isInterface() && ( rhs instanceof bsh.This ) ) 
		{
			return ((bsh.This)rhs).getInterface( lhsType );
		}

		assignmentError(lhsType, originalType);

		return rhs;
    }

    private static void	assignmentError(Class lhs, Class rhs) throws EvalError
    {
		String lhsType = Reflect.normalizeClassName(lhs);
		String rhsType = Reflect.normalizeClassName(rhs);
		throw new EvalError ("Can't assign " + rhsType + " to "	+ lhsType);
    }

	public String toString() {
		return
			"NameSpace: "
			+ ( name==null
				? super.toString()
				: name + " (" + super.toString() +")" );
	}

	/*
		For serialization.
		Don't serialize non-serializable objects.
	*/
    private synchronized void writeObject(java.io.ObjectOutputStream s)
        throws IOException {

		// do something here
		s.defaultWriteObject();
	}

	/**
		Invoke a method in this namespace with the specified args and
		interpreter reference.  The caller namespace is set to this namespace.
		This is a convenience for users outside of this package.
		<p>
		Note: this method is primarily intended for use internally.  If you use
		this method outside of the bsh package and wish to use variables with
		primitive values you will have to wrap them using bsh.Primitive.
		@see bsh.Primitive
	*/
	public Object invokeMethod( 
		String methodName, Object [] args, Interpreter interpreter ) 
		throws EvalError
	{
		return invokeMethod( methodName, args, interpreter, null, null );
	}

	/**
		invoke a method in this namespace with the specified args,
		interpreter reference, and callstack
		This is a convenience for users outside of this package.
		<p>
		Note: this method is primarily intended for use internally.  If you use
		this method outside of the bsh package and wish to use variables with
		primitive values you will have to wrap them using bsh.Primitive.
		@param if callStack is null a new CallStack will be created and
			initialized with this namespace.
		@see bsh.Primitive
	*/
	public Object invokeMethod( 
		String methodName, Object [] args, Interpreter interpreter, 
		CallStack callstack, SimpleNode callerInfo ) 
		throws EvalError
	{
		if ( callstack == null ) {
			callstack = new CallStack();
			callstack.push( this );
		}

		// Look for method in the bsh object
        BshMethod meth = getMethod( methodName, Reflect.getTypes( args ) );
        if ( meth != null )
           return meth.invokeDeclaredMethod( args, interpreter, callstack, callerInfo );

		// Look for a default invoke() handler method
		meth = getMethod( "invoke", new Class [] { null, null } );

		// Call script "invoke( String methodName, Object [] args );
		if ( meth != null )
			return meth.invokeDeclaredMethod( 
				new Object [] { methodName, args }, interpreter, callstack, callerInfo );

		throw new EvalError( "No locally declared method: " 
			+ methodName + " in namespace: " + this );
	}

	/**
		Clear all cached classes and names
	*/
	public void classLoaderChanged() {
		nameSpaceChanged();
	}

	/**
		Clear all cached classes and names
	*/
	public void nameSpaceChanged() {
		classCache = null;
	}

	/**
		Import standard packages.  Currently:
		<pre>
			importClass("bsh.EvalError");
			importPackage("javax.swing.event");
			importPackage("javax.swing");
			importPackage("java.awt.event");
			importPackage("java.awt");
			importPackage("java.net");
			importPackage("java.util");
			importPackage("java.io");
			importPackage("java.lang");
		</pre>
	*/
    public void loadDefaultImports()
    {
		/**
			Note: the resolver looks through these in reverse order, per
			precedence rules...  so for max efficiency put the most common
			ones later.
		*/
		importClass("bsh.EvalError");
		importPackage("javax.swing.event");
		importPackage("javax.swing");
		importPackage("java.awt.event");
		importPackage("java.awt");
		importPackage("java.net");
		importPackage("java.util");
		importPackage("java.io");
		importPackage("java.lang");

	/*
		String res = "lib/defaultImports";
		InputStream in = NameSpace.class.getResourceAsStream(res);
		if(in == null)
			throw new IOException("couldn't load resource: " + res);
		BufferedReader bin = new BufferedReader(new InputStreamReader(in));

		String s;
		try {
			while((s = bin.readLine()) != null)
			importPackage(s);

			bin.close();
		} catch(IOException e) {
			Interpreter.debug("failed to load default imports...");
		}
	*/

    }

	/**
		This is the factory for Name objects which resolve names within
		this namespace (e.g. toObject(), toClass(), toLHS()).
		This supports name resolver caching, allowing Name objects to 
		cache info about the resolution of names for performance reasons.
		(This would be called getName() if it weren't already used for the
		simple name of the NameSpace)
	*/
	Name getNameResolver( String name ) {
		// no caching yet
		return new Name(this,name);
	}

	public int getInvocationLine() {
		SimpleNode node = getNode();
		if ( node != null )
			return node.getLineNumber();
		else
			return -1;
	}
	public String getInvocationText() {
		SimpleNode node = getNode();
		if ( node != null )
			return node.getText();
		else
			return "<invoked from Java code>";
	}

	/**
		This is a helper method for working inside of bsh scripts and commands.
		In that context it is impossible to see a ClassIdentifier object
		for what it is.  Attempting to access a method on it will look like
		a static method invocation.
	*/
	public static Class identifierToClass( Name.ClassIdentifier ci ) 
	{
		return ci.getTargetClass();
	}

	/**
		Clear all variables, methods, and imports from this namespace.
		If this namespace is the root, it will be reset to the default 
		imports.
		@see loadDefaultImports()
	*/
	public void clear() 
	{
		variables = null;
		methods = null;
		importedClasses = null;
		importedPackages = null;
		superImport = false;
		if ( parent == null )
			loadDefaultImports();	
    	classCache = null;
	}
}