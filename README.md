## Generate Custom Token

- Use this website to generate random secret key - 
https://www.allkeysgenerator.com/Random/Security-Encryption-Key-Generator.aspx

- Use the following code snippet to generate random secret key - 
    TypeScript/JavaScript
    var token = crypto.randomBytes(64).toString('hex');

    Python
    import secrets
    secrets.token_bytes([nbytes=64])