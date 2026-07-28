static Map<String, Object> jsonParse(final HttpURLConnection c, final boolean useErrorStream) throws IOException {
    if (c.getContentLength() == 0) {
      return null;
    }
    final InputStream in = useErrorStream? c.getErrorStream(): c.getInputStream();
    if (in == null) {
      throw new IOException("The " + (useErrorStream? "error": "input") + " stream is null.");
    }
    try {
      final String contentType = c.getContentType();
      if (contentType != null) {
        final MediaType parsed = MediaType.valueOf(contentType);
        if (!MediaType.APPLICATION_JSON_TYPE.isCompatible(parsed)) {
          throw new IOException("Content-Type \"" + contentType
              + "\" is incompatible with \"" + MediaType.APPLICATION_JSON
              + "\" (parsed=\"" + parsed + "\")");
        }
      }
      ObjectMapper mapper = new ObjectMapper();
      return mapper.reader(Map.class).readValue(in);
    } finally {
      in.close();
    }
}