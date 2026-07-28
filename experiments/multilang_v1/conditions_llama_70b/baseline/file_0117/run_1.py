class DictionaryProbDist(ProbDistI):
    """
    A probability distribution whose probabilities are directly
    specified by a given dictionary.  The given dictionary maps
    samples to probabilities.
    """
    def __init__(self, prob_dict=None, log=False, normalize=False):
        """
        Construct a new probability distribution from the given
        dictionary, which maps values to probabilities (or to log
        probabilities, if ``log`` is true).  If ``normalize`` is
        true, then the probability values are scaled by a constant
        factor such that they sum to 1.

        If called without arguments, the resulting probability
        distribution assigns zero probability to all values.
        """

        self._prob_dict = prob_dict.copy() if prob_dict is not None else {}
        self._log = log

        if normalize:
            self._normalize()

    def _normalize(self):
        if not self._prob_dict:
            raise ValueError('A DictionaryProbDist must have at least one sample ' +
                             'before it can be normalized.')
        if self._log:
            value_sum = sum_logs(list(self._prob_dict.values()))
            if value_sum <= _NINF:
                logp = math.log(1.0/len(self._prob_dict), 2)
                for x in self._prob_dict:
                    self._prob_dict[x] = logp
            else:
                for (x, p) in self._prob_dict.items():
                    self._prob_dict[x] -= value_sum
        else:
            value_sum = sum(self._prob_dict.values())
            if value_sum == 0:
                p = 1.0/len(self._prob_dict)
                for x in self._prob_dict:
                    self._prob_dict[x] = p
            else:
                norm_factor = 1.0/value_sum
                for (x, p) in self._prob_dict.items():
                    self._prob_dict[x] *= norm_factor

    def prob(self, sample):
        if self._log:
            return (2**(self._prob_dict[sample]) if sample in self._prob_dict else 0)
        else:
            return self._prob_dict.get(sample, 0)

    def logprob(self, sample):
        if self._log:
            return self._prob_dict.get(sample, _NINF)
        else:
            if sample not in self._prob_dict: return _NINF
            elif self._prob_dict[sample] == 0: return _NINF
            else: return math.log(self._prob_dict[sample], 2)

    def max(self):
        if not hasattr(self, '_max'):
            self._max = max((p,v) for (v,p) in self._prob_dict.items())[1]
        return self._max
    def samples(self):
        return self._prob_dict.keys()
    def __repr__(self):
        return '<ProbDist with %d samples>' % len(self._prob_dict)