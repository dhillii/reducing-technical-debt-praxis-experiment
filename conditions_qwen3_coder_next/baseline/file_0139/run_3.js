const username = `${body.username}#${body.discriminator}`;
            callback(null, {
              username: username,
              email: body.email,