package	bsh;

import java.util.*;

import java.io.InputStream;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.IOException;

/**
    A namespace	in which methods and variables live.  This is package public 
	because it is used in the implementation of some bsh commands.  However
	for normal use you should be using methods on bsh.Interpreter to interact
	with your scripts.
	<p>

	A bsh.This object is a thin layer over a NameSpace.  Together they 
	comprise a bsh scripted object context.
	<p>

	Note: I'd really like to use collections here, but we have to keep this
	compatible with JDK1.1 
*/
/*
	Thanks to Slava Pestov (of jEdit fame) for import caching enhancements.

	Note: This class has gotten too big.  It should be broken down a bit.
*/
public class NameSpace 
	implements java.io.Serializable, BshClassManager.Listener, 
	NameSource
{
	public static final NameSpace JAVACODE = 
		new NameSpace("Called from compiled Java code");

	// Begin instance data
	// Note: if we add something here we should reset it in the clear() method.

	public String name; 
    private NameSpace parent;
    private Hashtable variables;
    private Hashtable methods;
    private Hashtable importedClasses;
    private This thisReference;
    private Vector importedPackages;

	/** "import *;" operation has been performed */
	transient private static boolean superImport;

	/**
		Local class cache for classes resolved through this namespace using 
		getClass() (taking into account imports).  Only unqualified class names
		are cached here (those which might be imported).  Qualified names are 
		always absolute and are cached by BshClassManager.
	*/
    transient private Hashtable classCache;

	// End instance data

    public NameSpace( String name ) { 
		this( null, name );
	}

    public NameSpace( NameSpace parent, String name ) {
		setName(name);
		setParent(parent);

		// Register for notification of classloader change
		BshClassManager.addCMListener(this);
    }

	public void setName( String name ) {
		this.name = name;
	}
	public String getName() {
		return this.name;
	}

	SimpleNode callerInfoNode;
	/**
		Set the node associated with the creation of this namespace.
		This is used in debugging.
	*/
	void setNode( SimpleNode node ) {
		this.callerInfoNode= node;
	}
	SimpleNode getNode() {
		return this.callerInfoNode;
	}

	/**
		Resolve name to an object through this namespace.
	*/
	public Object get( String name, Interpreter interpreter ) 
		throws EvalError 
	{
		CallStack callstack = new CallStack();
		return getNameResolver( name ).toObject( callstack, interpreter );
	}


	/**
		Set a variable in this namespace.
		<p>
		Note: this method is primarily intended for use internally.  If you use
		this method outside of the bsh package and wish to set variables with
		primitive values you will have to wrap them using bsh.Primitive.
		@see bsh.Primitive

		@param value a value of null will remove the variable definition.
	*/
    public void	setVariable(String name, Object	value) throws EvalError 
	{
		if ( variables == null )
			variables =	new Hashtable();

		// hack... should factor this out...
		if ( value == null ) {
			variables.remove(name);
			return;
		}

		// Locate the variable definition if it exists
		// if strictJava then recurse, else default local scope
		boolean recurse = Interpreter.strictJava;
		Object current = getVariableImpl( name, recurse );

		// found a typed variable
		if ( (current != null) && (current instanceof TypedVariable) )
		{
			try {
				((TypedVariable)current).setValue(value);
			} catch(EvalError e) {
				throw new EvalError(
					"Typed variable: " + name + ": " + e.getMessage());
			} 
		} else
			if ( Interpreter.strictJava )
				throw new EvalError(
					"(Strict Java mode) Assignment to undeclared variable: "
					+name );
			else
				variables.put(name, value);
    }

	/**
		Get the names of variables defined in this namespace.
		(This does not show variables in parent namespaces).
	*/
	public String [] getVariableNames() {
		if ( variables == null )
			return new String [0];
		else
			return enumerationToStringArray( variables.keys() );
	}

	/**
		Get the names of methods defined in this namespace.
		(This does not show methods in parent namespaces).
	*/
	public String [] getMethodNames() {
		if ( methods == null )
			return new String [0];
		else
			return enumerationToStringArray( methods.keys() );
	}

	private String [] enumerationToStringArray( Enumeration e ) {
		Vector v = new Vector();
		while ( e.hasMoreElements() )
			v.addElement( e.nextElement() );
		String [] sa = new String [ v.size() ];
		v.copyInto( sa );
		return sa;
	}

	/**
		Get the parent namespace.
		Note: this isn't quite the same as getSuper().
		getSuper() returns 'this' if we are at the root namespace.
	*/
	public NameSpace getParent() {
		return parent;
	}

    public NameSpace getSuper()
    {
		if(parent != null)
			return parent;
		else
			return this;
    }

    public NameSpace getGlobal()
    {
		if(parent != null)
			return parent.getGlobal();
		else
			return this;
    }

	
	/**
		A This object is a thin layer over a namespace, comprising a bsh object
		context.  We create it here only if needed for the namespace.

		Note: that This is factoried for different capabilities.  When we
		add classpath modification we'll have to have a listener here to
		uncache the This reference and allow it to be refactoried.
	*/
    This getThis( Interpreter declaringInterpreter ) {

		if ( thisReference == null )
			thisReference = This.getThis( this, declaringInterpreter );

		return thisReference;
    }

	/**
		Used for serialization
	*/
	public void prune() {
		setParent( null );

	/*
	Do we need this?
	If so, fix the loop... can get Vectors of methods as well as methods

		if ( methods != null )
			// Prune the methods of this namespace - detach the nodes
			// from their parent nodes. 
			for( Enumeration e=methods.elements(); e.hasMoreElements(); )
				((BshMethod)e.nextElement()).method.prune();
	*/
	}

	public void setParent( NameSpace parent ) {
		this.parent = parent;

		// If we are disconnected from root we need to handle the def imports
		if ( parent == null )
			loadDefaultImports();
	}

	/**
		Get the specified variable in this namespace or a parent namespace.
		<p>
		Note: this method is primarily intended for use internally.  If you use
		this method outside of the bsh package you will have to use 
		Primitive.unwrap() to get primitive values.
		@see Primitive.unwrap()

		@return The variable value or Primitive.VOID if it is not defined.
	*/
    public Object getVariable( String name ) {
		return getVariable( name, true );
	}

	/**
		Get the specified variable in this namespace.
		If recurse is true extend search through parent namespaces.
		<p>
		Note: this method is primarily intended for use internally.  If you use
		this method outside of the bsh package you will have to use 
		Primitive.unwrap() to get primitive values.
		@see Primitive.unwrap()

		@return The variable value or Primitive.VOID if it is not defined.
	*/
    public Object getVariable( String name, boolean recurse ) {
		Object val = getVariableImpl( name, recurse );
		return unwrapVariable( val );
    }

	/**
		Unwrap a typed variable to its value.
		Turn null into Primitive.VOID
	*/
	protected Object unwrapVariable( Object val ) {
		if (val instanceof TypedVariable)
			val	= ((TypedVariable)val).getValue();

		return (val == null) ? Primitive.VOID :	val;
	}

	/**
		Return the raw variable retrieval (TypedVariable object or for untyped
		the simple value) with optional recursion.
		@return the raw variable value or null if it is not defined
	*/
    protected Object getVariableImpl( String name, boolean recurse ) {
		Object val = null;

		if(variables !=	null)
			val	= variables.get(name);

		if ( recurse && (val == null) && (parent != null) )
			val	= parent.getVariableImpl(name, recurse);

		return val;
    }

	/**
		Initialize a typed variable with the appropriate default value for its type.
		@param type the class type of the variable
		@return the default value wrapped as a Primitive or Primitive.NULL
	*/
	private Object getDefaultValueForType(Class type) {
		if (type.isPrimitive()) {
			if (type == Boolean.TYPE)
				return new Primitive(Boolean.FALSE);
			else if (type == Byte.TYPE)
				return new Primitive((byte)0);
			else if (type == Short.TYPE)
				return new Primitive((short)0);
			else if (type == Character.TYPE)
				return new Primitive((char)0);
			else if (type == Integer.TYPE)
				return new Primitive((int)0);
			else if (type == Long.TYPE)
				return new Primitive(0L);
			else if (type == Float.TYPE)
				return new Primitive(0.0f);
			else if (type == Double.TYPE)
				return new Primitive(0.0d);
		}
		return Primitive.NULL;
	}

	/**
		Check if a typed variable already exists and validate type compatibility.
		@param name the variable name
		@param type the declared type
		@return true if variable exists and is compatible, false if it doesn't exist
		@throws EvalError if type mismatch occurs
	*/
	private boolean validateExistingTypedVariable(String name, Class type) 
		throws EvalError 
	{
		if (!variables.containsKey(name))
			return false;

		Object existing = getVariableImpl(name, false);
		if (!(existing instanceof TypedVariable))
			return false;

		TypedVariable typedVar = (TypedVariable)existing;
		if (typedVar.getType() != type)
			throw new EvalError("Typed variable: " + name
				+ " was previously declared with type: " 
				+ typedVar.getType());
		return true;
	}

    /**
		Set the typed variable with the value.  
		An existing typed variable may only be set to the same type.
		If an untyped variable exists it will be overridden with the new
		typed var.
		The set will perform a getAssignableForm() on the value if necessary.

		<p>
		Note: this method is primarily intended for use internally.  If you use
		this method outside of the bsh package and wish to set variables with
		primitive values you will have to wrap them using bsh.Primitive.
		@see bsh.Primitive

		@param value If value is null, you'll get the default value for the type
    */
    public void	setTypedVariable(
		String	name, Class type, Object value,	boolean	isFinal) 
		throws EvalError 
	{
		if (variables == null)
			variables = new Hashtable();

		if (value == null)
			value = getDefaultValueForType(type);

		if (validateExistingTypedVariable(name, type)) {
			Object existing = getVariableImpl(name, false);
			((TypedVariable)existing).setValue(value);
			return;
		}

		variables.put(name, new TypedVariable(type, value, isFinal));
    }

	/**
		Note: this is primarily for internal use.
		@see Interpreter.source()
		@see Interpreter.eval()
	*/
    public void	setMethod(String name, BshMethod method) 
	{
		if(methods == null)
			methods = new Hashtable();

		Object m = methods.get(name);

		if ( m == null )
			methods.put(name, method);
		else 
		if ( m instanceof BshMethod ) {
			Vector v = new Vector();
			v.addElement( m );
			v.addElement( method );
			methods.put( name, v );
		} else // Vector
			((Vector)m).addElement( method );
    }

	/**
		Get the bsh method matching the specified signature declared in 
		this name space or a parent.
		<p>
		Note: this method is primarily intended for use internally.  If you use
		this method outside of the bsh package you will have to be familiar
		with BeanShell's use of the Primitive wrapper class.
		@see bsh.Primitive
	*/
    public BshMethod getMethod( String name, Class [] sig ) 
	{
		BshMethod method = null;

		Object m = null;
		if ( methods != null )
			m = methods.get(name);

		if ( m instanceof Vector ) {
			Vector vm = (Vector)m;
			BshMethod [] ma = new BshMethod[ vm.size() ];
			vm.copyInto( ma );

			Class [][] candidates = new Class[ ma.length ][];
			for( int i=0; i< ma.length; i++ )
				candidates[i] = ma[i].getArgTypes();

			int match = Reflect.findMostSpecificSignature( sig, candidates );
			if ( match != -1 )
				method = ma[match];
		} else
			method = (BshMethod)m;
			
		if ((method == null) && (parent != null))
			return parent.getMethod( name, sig );

		return method;
    }

	/**
		Import a class name.
		Subsequent imports override earlier ones
	*/
    public void	importClass(String name)
    {
		if(importedClasses == null)
			importedClasses = new Hashtable();

		importedClasses.put(Name.suffix(name, 1), name);
		nameSpaceChanged();
    }

	/**
		subsequent imports override earlier ones
	*/
    public void	importPackage(String name)
    {
		if(importedPackages == null)
			importedPackages = new Vector();

		importedPackages.addElement(name);
		nameSpaceChanged();
    }

	/**
		Get a list of all imported packages including parents.
		in the order in which they were imported...
		Note that the resolver may use them in the reverse order for
		precedece reasons.
		@deprecated
	*/
    public String[] getImportedPackages()
    {
		Vector v = getImportedPackages(true);
		String[] packages = new	String[ v.size() ];
		v.copyInto(packages);
		return packages;
    }

	/**
		Get a list of all imported packages in the order in which they were 
		imported...  If recurse is true, also include the parent's.
	*/
    public Vector getImportedPackages( boolean recurse )
    {
		if ( !recurse )
			return importedPackages;
		else {
			Vector v = new Vector();
			// add parent's
			if ( parent != null ) {
				String [] psa = parent.getImportedPackages();
				for(int i=0; i<psa.length; i++)
					v.addElement(psa[i]);
			}
			// add ours
			if ( importedPackages != null )
				for(int i=0; i< importedPackages.size(); i++)
					v.addElement( importedPackages.elementAt(i) );

			return v;
		}
    }

// debug
//public static int cacheCount = 0;

	/**
		Helper that caches class.
	*/
	private void cacheClass( Class c ) {
		if ( classCache == null ) {
			classCache = new Hashtable();
			//cacheCount++; // debug
		}

		classCache.put(name, c);
	}

	/**
		Load a class through this namespace taking into account imports.
		The class search will proceed through the parent namespaces if
		necessary.

		@return null if not found.
	*/
    public Class getClass( String name)
		throws ClassPathException
    {
		Class c = getClassImpl(name);
		if ( c != null )
			return c;
		else
			// implement the recursion for getClassImpl()
			if ( parent != null )
				return parent.getClass( name );
			else
				return null;
	}

	/**
		Check if a name is unqualified and look it up in cache.
		@param name the class name to check
		@return the cached class or null if not found
	*/
	private Class checkClassCache(String name) {
		if (classCache != null) {
			Class c = (Class)classCache.get(name);
			if (c != null)
				return c;
		}
		return null;
	}

	/**
		Try to load an unqualified name as an imported class.
		@param name the unqualified class name
		@return the class if found, null otherwise
		@throws ClassPathException on class loading errors
	*/
	private Class loadUnqualifiedImportedClass(String name) 
		throws ClassPathException 
	{
		Class c = getImportedClassImpl(name);
		if (c != null) {
			cacheClass(c);
			return c;
		}
		return null;
	}

	/**
		Try to load a class by absolute name.
		@param name the class name to load
		@param unqualifiedName true if this is an unqualified name
		@return the class if found, null otherwise
		@throws ClassPathException on class loading errors
	*/
	private Class loadAbsoluteClass(String name, boolean unqualifiedName) 
		throws ClassPathException 
	{
		Class c = classForName(name);
		if (c != null) {
			if (unqualifiedName)
				cacheClass(c);
			return c;
		}
		return null;
	}

	/**
		Implementation of getClass() 

		Load a class through this namespace taking into account imports.
		<p>

		Check the cache first.  If an unqualified name look for imported 
		class or package.  Else try to load absolute name.
		<p>

		This method implements caching of unqualified names (normally imports).
		Qualified names are cached by BshClassManager.
		Unqualified absolute class names (e.g. unpackaged Foo) are cached too
		so that we don't go searching through the imports for them each time.

		@return null if not found.
	*/
    private Class getClassImpl( String name )
		throws ClassPathException
    {
		boolean unqualifiedName = !Name.isCompound(name);
		
		Class c = checkClassCache(name);
		if (c != null)
			return c;
		
		if (unqualifiedName) {
			c = loadUnqualifiedImportedClass(name);
			if (c != null)
				return c;
		}

		c = loadAbsoluteClass(name, unqualifiedName);
		if (c != null)
			return c;

		Interpreter.debug("getClass(): " + name + " not found in " + this);
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
			Class clas = tryLoadImportedClass(fullname);
			if (clas != null)
				return clas;
			return null;
		}

		return tryImportedPackages(name);
    }

	/**
		Attempt to load an explicitly imported class by its full name.
		@param fullname the fully qualified class name
		@return the class if found, null otherwise
		@throws ClassPathException on class loading errors
	*/
	private Class tryLoadImportedClass(String fullname) 
		throws ClassPathException 
	{
		Class clas = classForName(fullname);
		
		if (clas == null && Name.isCompound(fullname)) {
			try {
				clas = getNameResolver(fullname).toClass();
			} catch (EvalError e) { 
				// not a class
			}
			
			if (clas != null) {
				BshClassManager.cacheClassInfo(fullname, clas);
				return clas;
			}
		} else if (clas == null) {
			Interpreter.debug("imported unpackaged name not found:" + fullname);
		}
		
		return clas;
	}

	/**
		Try to resolve a name through imported packages.
		@param name the unqualified class name
		@return the class if found, null otherwise
		@throws ClassPathException on class loading errors
	*/
	private Class tryImportedPackages(String name) 
		throws ClassPathException 
	{
		if (importedPackages != null) {
			for (int i = importedPackages.size() - 1; i >= 0; i--) {
				String s = ((String)importedPackages.elementAt(i)) + "." + name;
				Class c = classForName(s);
				if (c != null)
					return c;
			}
		}

		return trySuperImport(name);
	}

	/**
		Try to resolve a name through super import if available.
		@param name the unqualified class name
		@return the class if found, null otherwise
		@throws ClassPathException on class loading errors
	*/
	private Class trySuperImport(String name) 
		throws ClassPathException 
	{
		if (superImport) {
			BshClassManager bcm = BshClassManager.getClassManager();
			if (bcm != null) {
				String s = bcm.getClassNameByUnqName(name);
				if (s != null)
					return classForName(s);
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
		Handle assignment of Primitive types to target type.
		@param rhs the Primitive value
		@param lhsType the target type
		@return the assignable form of the value
		@throws EvalError if assignment is not possible
	*/
	private static Object handlePrimitiveAssignment(Object rhs, Class lhsType) 
		throws EvalError 
	{
		Class rhsType = ((Primitive)rhs).getType();
		
		if (lhsType.isPrimitive()) {
			return rhs;
		}
		
		if (Boolean.class.isAssignableFrom(lhsType) ||
			Character.class.isAssignableFrom(lhsType) ||
			Number.class.isAssignableFrom(lhsType)) {
			return ((Primitive)rhs).getValue();
		}
		
		assignmentError(lhsType, rhsType);
		return rhs;
	}

	/**
		Handle assignment of non-Primitive object types to target type.
		@param rhs the object value
		@param lhsType the target type
		@return the assignable form of the value
		@throws EvalError if assignment is not possible
	*/
	private static Object handleObjectAssignment(Object rhs, Class lhsType) 
		throws EvalError 
	{
		Class rhsType = rhs.getClass();
		
		if (!lhsType.isPrimitive()) {
			return rhs;
		}
		
		if (rhsType == Boolean.class) {
			return new Primitive((Boolean)rhs);
		} else if (rhsType == Character.class) {
			return new Primitive((Character)rhs);
		} else if (Number.class.isAssignableFrom(rhsType)) {
			return new Primitive((Number)rhs);
		}
		
		assignmentError(lhsType, rhsType);
		return rhs;
	}

	/**
		Check if RHS is assignable to LHS using standard reflection rules.
		@param lhsType the target type
		@param rhsType the source type
		@return true if assignable
	*/
	private static boolean isStandardlyAssignable(Class lhsType, Class rhsType) {
		return Reflect.isAssignableFrom(lhsType, rhsType);
	}

	/**
		Attempt widening conversion for numeric wrapper types.
		@param lhsType the target type
		@param rhs the value to convert
		@param rhsType the source type
		@return the converted value or null if no conversion applies
	*/
	private static Object attemptNumericWidening(Class lhsType, Object rhs, Class rhsType) {
		if (lhsType == Short.class && rhsType == Byte.class)
			return new Short(((Number)rhs).shortValue());

		if (lhsType == Integer.class) {
			if (rhsType == Byte.class || rhsType == Short.class)
				return new Integer(((Number)rhs).intValue());
			if (rhsType == Character.class)
				return new Integer(((Number)rhs).intValue());
		}

		if (lhsType == Long.class) {
			if (rhsType == Byte.class || rhsType == Short.class || rhsType == Integer.class)
				return new Long(((Number)rhs).longValue());
			if (rhsType == Character.class)
				return new Long(((Number)rhs).longValue());
		}

		if (lhsType == Float.class) {
			if (rhsType == Byte.class || rhsType == Short.class || 
				rhsType == Integer.class || rhsType == Long.class)
				return new Float(((Number)rhs).floatValue());
			if (rhsType == Character.class)
				return new Float(((Number)rhs).floatValue());
		}

		if (lhsType == Double.class) {
			if (rhsType == Byte.class || rhsType == Short.class || 
				rhsType == Integer.class || rhsType == Long.class || rhsType == Float.class)
				return new Double(((Number)rhs).doubleValue());
			if (rhsType == Character.class)
				return new Double(((Number)rhs).doubleValue());
		}

		return null;
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

		if (rhs == Primitive.NULL) {
			if(!lhsType.isPrimitive())
				return rhs;
			else
				throw new EvalError(
					"Can't assign null to primitive type " + lhsType.getName());
		}

		Class rhsType;

		if ( rhs instanceof Primitive ) 
		{
			rhsType = originalType = ((Primitive)rhs).getType();
			rhs = handlePrimitiveAssignment(rhs, lhsType);
			rhsType = (rhs instanceof Primitive) ? ((Primitive)rhs).getType() : rhs.getClass();
		} else 
		{
			rhsType = originalType = rhs.getClass();
			rhs = handleObjectAssignment(rhs, lhsType);
			rhsType = rhs.getClass();
		}

		if (isStandardlyAssignable(lhsType, rhsType))
			return rhs;

		Object widened = attemptNumericWidening(lhsType, rhs, rhsType);
		if (widened != null)
			return widened;

		if (Capabilities.canGenerateInterfaces() && 
			lhsType.isInterface() && (rhs instanceof bsh.This)) {
			return ((bsh.This)rhs).getInterface(lhsType);
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