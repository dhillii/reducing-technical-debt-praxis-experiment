return false;
            }

            const coll  = this.fullCollection || this,
                index = this.indexOf(model);

            coll.remove(model);