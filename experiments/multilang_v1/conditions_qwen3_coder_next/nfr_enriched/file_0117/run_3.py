import math
import random
import warnings
import array
from operator import itemgetter
from collections import defaultdict
from functools import reduce
from nltk import compat
from nltk.compat import Counter

from nltk.internals import raise_unorderable_types

_NINF = float('-1e300')


##//////////////////////////////////////////////////////
##  Frequency Distributions
##//////////////////////////////////////////////////////

@compat.python_2_unicode_compatible
class FreqDist(Counter):
    """
    A frequency distribution for the outcomes of an experiment.  A
    frequency distribution records the number of times each outcome of
    an experiment has occurred.  For example, a frequency distribution
    could be used to record the frequency of each word type in a
    document.  Formally, a frequency distribution can be defined as a
    function mapping from each sample to the number of times that
    sample occurred as an outcome.

    Frequency distributions are generally constructed by running a
    number of experiments, and incrementing the count for a sample
    every time it is an outcome of an experiment.  For example, the
    following code will produce a frequency distribution that encodes
    how often each word occurs in a text:

        >>> from nltk.tokenize import word_tokenize
        >>> from nltk.probability import FreqDist
        >>> sent = 'This is an example sentence'
        >>> fdist = FreqDist()
        >>> for word in word_tokenize(sent):
        ...    fdist[word.lower()] += 1

    An equivalent way to do this is with the initializer:

        >>> fdist = FreqDist(word.lower() for word in word_tokenize(sent))

    """

    def __init__(self, samples=None):
        Counter.__init__(self, samples)

    def N(self):
        return sum(self.values())

    def B(self):
        return len(self)

    def hapaxes(self):
        return [item for item in self if self[item] == 1]

    def Nr(self, r, bins=None):
        return self.r_Nr(bins)[r]

    def r_Nr(self, bins=None):
        _r_Nr = defaultdict(int)
        for count in self.values():
            _r_Nr[count] += 1
        _r_Nr[0] = bins - self.B() if bins is not None else 0
        return _r_Nr

    def _cumulative_frequencies(self, samples):
        cf = 0.0
        for sample in samples:
            cf += self[sample]
            yield cf

    def freq(self, sample):
        if self.N() == 0:
            return 0
        return self[sample] / self.N()

    def max(self):
        if len(self) == 0:
            raise ValueError('A FreqDist must have at least one sample before max is defined.')
        return self.most_common(1)[0][0]

    def plot(self, *args, **kwargs):
        try:
            from matplotlib import pylab
        except ImportError:
            raise ValueError('The plot function requires matplotlib to be installed.'
                         'See http://matplotlib.org/')

        if len(args) == 0:
            args = [len(self)]
        samples = [item for item, _ in self.most_common(*args)]

        cumulative = _get_kwarg(kwargs, 'cumulative', False)
        if cumulative:
            freqs = list(self._cumulative_frequencies(samples))
            ylabel = "Cumulative Counts"
        else:
            freqs = [self[sample] for sample in samples]
            ylabel = "Counts"

        pylab.grid(True, color="silver")
        if not "linewidth" in kwargs:
            kwargs["linewidth"] = 2
        if "title" in kwargs:
            pylab.title(kwargs["title"])
            del kwargs["title"]
        pylab.plot(freqs, **kwargs)
        pylab.xticks(range(len(samples)), [compat.text_type(s) for s in samples], rotation=90)
        pylab.xlabel("Samples")
        pylab.ylabel(ylabel)
        pylab.show()

    def tabulate(self, *args, **kwargs):
        if len(args) == 0:
            args = [len(self)]
        samples = [item for item, _ in self.most_common(*args)]

        cumulative = _get_kwarg(kwargs, 'cumulative', False)
        if cumulative:
            freqs = list(self._cumulative_frequencies(samples))
        else:
            freqs = [self[sample] for sample in samples]

        width = max(len("%s" % s) for s in samples)
        width = max(width, max(len("%d" % f) for f in freqs))

        for i in range(len(samples)):
            print("%*s" % (width, samples[i]), end=' ')
        print()
        for i in range(len(samples)):
            print("%*d" % (width, freqs[i]), end=' ')
        print()

    def copy(self):
        return self.__class__(self)

    def __add__(self, other):
        return self.__class__(super(FreqDist, self).__add__(other))

    def __sub__(self, other):
        return self.__class__(super(FreqDist, self).__sub__(other))

    def __or__(self, other):
        return self.__class__(super(FreqDist, self).__or__(other))

    def __and__(self, other):
        return self.__class__(super(FreqDist, self).__and__(other))

    def __le__(self, other):
        if not isinstance(other, FreqDist):
            raise_unorderable_types("<=", self, other)
        return set(self).issubset(other) and all(self[key] <= other[key] for key in self)

    __ge__ = lambda self, other: not self <= other or self == other
    __lt__ = lambda self, other: self <= other and not self == other
    __gt__ = lambda self, other: not self <= other

    def __repr__(self):
        return self.pformat()

    def pprint(self, maxlen=10, stream=None):
        print(self.pformat(maxlen=maxlen), file=stream)

    def pformat(self, maxlen=10):
        items = ['{0!r}: {1!r}'.format(*item) for item in self.most_common(maxlen)]
        if len(self) > maxlen:
            items.append('...')
        return 'FreqDist({{{0}}})'.format(', '.join(items))

    def __str__(self):
        return '<FreqDist with %d samples and %d outcomes>' % (len(self), self.N())


##//////////////////////////////////////////////////////
##  Probability Distributions
##//////////////////////////////////////////////////////

class ProbDistI(object):
    SUM_TO_ONE = True

    def __init__(self):
        if self.__class__ == ProbDistI:
            raise NotImplementedError("Interfaces can't be instantiated")

    def prob(self, sample):
        raise NotImplementedError()

    def logprob(self, sample):
        p = self.prob(sample)
        return (math.log(p, 2) if p != 0 else _NINF)

    def max(self):
        raise NotImplementedError()

    def samples(self):
        raise NotImplementedError()

    def discount(self):
        return 0.0

    def generate(self):
        p = random.random()
        p_init = p
        for sample in self.samples():
            p -= self.prob(sample)
            if p <= 0: return sample
        if p < .0001:
            return sample
        if self.SUM_TO_ONE:
            warnings.warn("Probability distribution %r sums to %r; generate()"
                          " is returning an arbitrary sample." % (self, p_init-p))
        return random.choice(list(self.samples()))


@compat.python_2_unicode_compatible
class UniformProbDist(ProbDistI):
    def __init__(self, samples):
        if len(samples) == 0:
            raise ValueError('A Uniform probability distribution must '+
                             'have at least one sample.')
        self._sampleset = set(samples)
        self._prob = 1.0/len(self._sampleset)
        self._samples = list(self._sampleset)

    def prob(self, sample):
        return (self._prob if sample in self._sampleset else 0)

    def max(self):
        return self._samples[0]

    def samples(self):
        return self._samples

    def __repr__(self):
        return '<UniformProbDist with %d samples>' % len(self._sampleset)


@compat.python_2_unicode_compatible
class RandomProbDist(ProbDistI):
    def __init__(self, samples):
        if len(samples) == 0:
            raise ValueError('A probability distribution must '+
                             'have at least one sample.')
        self._probs = self.unirand(samples)
        self._samples = list(self._probs.keys())

    @classmethod
    def unirand(cls, samples):
        randrow = [random.random() for i in range(len(samples))]
        total = sum(randrow)
        for i, x in enumerate(randrow):
            randrow[i] = x/total

        total = sum(randrow)
        if total != 1:
            randrow[-1] -= total - 1

        return dict((s, randrow[i]) for i, s in enumerate(samples))

    def prob(self, sample):
        return self._probs.get(sample, 0)

    def samples(self):
        return self._samples

    def __repr__(self):
        return '<RandomUniformProbDist with %d samples>' %len(self._probs)


@compat.python_2_unicode_compatible
class DictionaryProbDist(ProbDistI):
    def __init__(self, prob_dict=None, log=False, normalize=False):
        self._prob_dict = (prob_dict.copy() if prob_dict is not None else {})
        self._log = log

        if normalize:
            self._normalize_distribution(prob_dict, log)

    def _normalize_distribution(self, prob_dict, log):
        if len(prob_dict) == 0:
            raise ValueError('A DictionaryProbDist must have at least one sample ' +
                             'before it can be normalized.')

        if log:
            value_sum = sum_logs(list(self._prob_dict.values()))
            if value_sum <= _NINF:
                logp = math.log(1.0/len(prob_dict), 2)
                for x in prob_dict:
                    self._prob_dict[x] = logp
            else:
                for (x, p) in self._prob_dict.items():
                    self._prob_dict[x] -= value_sum
        else:
            value_sum = sum(self._prob_dict.values())
            if value_sum == 0:
                p = 1.0/len(prob_dict)
                for x in prob_dict:
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


@compat.python_2_unicode_compatible
class MLEProbDist(ProbDistI):
    def __init__(self, freqdist, bins=None):
        self._freqdist = freqdist

    def freqdist(self):
        return self._freqdist

    def prob(self, sample):
        return self._freqdist.freq(sample)

    def max(self):
        return self._freqdist.max()

    def samples(self):
        return self._freqdist.keys()

    def __repr__(self):
        return '<MLEProbDist based on %d samples>' % self._freqdist.N()


@compat.python_2_unicode_compatible
class LidstoneProbDist(ProbDistI):
    SUM_TO_ONE = False
    def __init__(self, freqdist, gamma, bins=None):
        if (bins == 0) or (bins is None and freqdist.N() == 0):
            name = self.__class__.__name__[:-8]
            raise ValueError('A %s probability distribution ' % name +
                             'must have at least one bin.')
        if (bins is not None) and (bins < freqdist.B()):
            name = self.__class__.__name__[:-8]
            raise ValueError('\nThe number of bins in a %s distribution ' % name +
                             '(%d) must be greater than or equal to\n' % bins +
                             'the number of bins in the FreqDist used ' +
                             'to create it (%d).' % freqdist.B())

        self._freqdist = freqdist
        self._gamma = float(gamma)
        self._N = self._freqdist.N()

        if bins is None:
            bins = freqdist.B()
        self._bins = bins

        self._divisor = self._N + bins * gamma
        if self._divisor == 0.0:
            self._gamma = 0
            self._divisor = 1

    def freqdist(self):
        return self._freqdist

    def prob(self, sample):
        c = self._freqdist[sample]
        return (c + self._gamma) / self._divisor

    def max(self):
        return self._freqdist.max()

    def samples(self):
        return self._freqdist.keys()

    def discount(self):
        gb = self._gamma * self._bins
        return gb / (self._N + gb)

    def __repr__(self):
        return '<LidstoneProbDist based on %d samples>' % self._freqdist.N()


@compat.python_2_unicode_compatible
class LaplaceProbDist(LidstoneProbDist):
    def __init__(self, freqdist, bins=None):
        LidstoneProbDist.__init__(self, freqdist, 1, bins)

    def __repr__(self):
        return '<LaplaceProbDist based on %d samples>' % self._freqdist.N()


@compat.python_2_unicode_compatible
class ELEProbDist(LidstoneProbDist):
    def __init__(self, freqdist, bins=None):
        LidstoneProbDist.__init__(self, freqdist, 0.5, bins)

    def __repr__(self):
        return '<ELEProbDist based on %d samples>' % self._freqdist.N()


@compat.python_2_unicode_compatible
class HeldoutProbDist(ProbDistI):
    SUM_TO_ONE = False
    def __init__(self, base_fdist, heldout_fdist, bins=None):
        self._base_fdist = base_fdist
        self._heldout_fdist = heldout_fdist

        self._max_r = base_fdist[base_fdist.max()]
        Tr = self._calculate_Tr()
        r_Nr = base_fdist.r_Nr(bins)
        Nr = [r_Nr[r] for r in range(self._max_r+1)]
        N = heldout_fdist.N()

        self._estimate = self._calculate_estimate(Tr, Nr, N)

    def _calculate_Tr(self):
        Tr = [0.0] * (self._max_r+1)
        for sample in self._heldout_fdist:
            r = self._base_fdist[sample]
            Tr[r] += self._heldout_fdist[sample]
        return Tr

    def _calculate_estimate(self, Tr, Nr, N):
        estimate = []
        for r in range(self._max_r+1):
            if Nr[r] == 0: estimate.append(None)
            else: estimate.append(Tr[r]/(Nr[r]*N))
        return estimate

    def base_fdist(self):
        return self._base_fdist

    def heldout_fdist(self):
        return self._heldout_fdist

    def samples(self):
        return self._base_fdist.keys()

    def prob(self, sample):
        r = self._base_fdist[sample]
        return self._estimate[r]

    def max(self):
        return self._base_fdist.max()

    def discount(self):
        raise NotImplementedError()

    def __repr__(self):
        s = '<HeldoutProbDist: %d base samples; %d heldout samples>'
        return s % (self._base_fdist.N(), self._heldout_fdist.N())


@compat.python_2_unicode_compatible
class CrossValidationProbDist(ProbDistI):
    SUM_TO_ONE = False
    def __init__(self, freqdists, bins):
        self._freqdists = freqdists
        self._heldout_probdists = []
        for fdist1 in freqdists:
            for fdist2 in freqdists:
                if fdist1 is not fdist2:
                    probdist = HeldoutProbDist(fdist1, fdist2, bins)
                    self._heldout_probdists.append(probdist)

    def freqdists(self):
        return self._freqdists

    def samples(self):
        return set(sum([list(fd) for fd in self._freqdists], []))

    def prob(self, sample):
        prob = 0.0
        for heldout_probdist in self._heldout_probdists:
            prob += heldout_probdist.prob(sample)
        return prob/len(self._heldout_probdists)

    def discount(self):
        raise NotImplementedError()

    def __repr__(self):
        return '<CrossValidationProbDist: %d-way>' % len(self._freqdists)


@compat.python_2_unicode_compatible
class WittenBellProbDist(ProbDistI):
    def __init__(self, freqdist, bins=None):
        assert bins is None or bins >= freqdist.B(),\
               'bins parameter must not be less than %d=freqdist.B()' % freqdist.B()
        if bins is None:
            bins = freqdist.B()
        self._freqdist = freqdist
        self._T = self._freqdist.B()
        self._Z = bins - self._freqdist.B()
        self._N = self._freqdist.N()

        if self._N==0:
            self._P0 = 1.0 / self._Z
        else:
            self._P0 = self._T / (self._Z * (self._N + self._T))

    def prob(self, sample):
        c = self._freqdist[sample]
        return (c / (self._N + self._T) if c != 0 else self._P0)

    def max(self):
        return self._freqdist.max()

    def samples(self):
        return self._freqdist.keys()

    def freqdist(self):
        return self._freqdist

    def discount(self):
        raise NotImplementedError()

    def __repr__(self):
        return '<WittenBellProbDist based on %d samples>' % self._freqdist.N()


##//////////////////////////////////////////////////////
##  Good-Turing Probability Distributions
##//////////////////////////////////////////////////////

@compat.python_2_unicode_compatible
class SimpleGoodTuringProbDist(ProbDistI):
    SUM_TO_ONE = False
    def __init__(self, freqdist, bins=None):
        assert bins is None or bins > freqdist.B(),\
               'bins parameter must not be less than %d=freqdist.B()+1' % (freqdist.B()+1)
        if bins is None:
            bins = freqdist.B() + 1
        self._freqdist = freqdist
        self._bins = bins
        r, nr = self._r_Nr()
        self.find_best_fit(r, nr)
        self._switch(r, nr)
        self._renormalize(r, nr)

    def _r_Nr_non_zero(self):
        r_Nr = self._freqdist.r_Nr()
        del r_Nr[0]
        return r_Nr

    def _r_Nr(self):
        nonzero = self._r_Nr_non_zero()
        if not nonzero:
            return [], []
        return zip(*sorted(nonzero.items()))

    def find_best_fit(self, r, nr):
        if not r or not nr:
            return

        zr = []
        for j in range(len(r)):
            i = (r[j-1] if j > 0 else 0)
            k = (2 * r[j] - i if j == len(r) - 1 else r[j+1])
            zr_ = 2.0 * nr[j] / (k - i)
            zr.append(zr_)

        log_r = [math.log(i) for i in r]
        log_zr = [math.log(i) for i in zr]

        xy_cov = x_var = 0.0
        x_mean = sum(log_r) / len(log_r)
        y_mean = sum(log_zr) / len(log_zr)
        for (x, y) in zip(log_r, log_zr):
            xy_cov += (x - x_mean) * (y - y_mean)
            x_var += (x - x_mean)**2
        self._slope = (xy_cov / x_var if x_var != 0 else 0.0)
        if self._slope >= -1:
            warnings.warn('SimpleGoodTuring did not find a proper best fit '
                          'line for smoothing probabilities of occurrences. '
                          'The probability estimates are likely to be '
                          'unreliable.')
        self._intercept = y_mean - self._slope * x_mean

    def _switch(self, r, nr):
        for i, r_ in enumerate(r):
            if len(r) == i + 1 or r[i+1] != r_ + 1:
                self._switch_at = r_
                break

            Sr = self.smoothedNr
            smooth_r_star = (r_ + 1) * Sr(r_+1) / Sr(r_)
            unsmooth_r_star = (r_ + 1) * nr[i+1] / nr[i]

            std = math.sqrt(self._variance(r_, nr[i], nr[i+1]))
            if abs(unsmooth_r_star-smooth_r_star) <= 1.96 * std:
                self._switch_at = r_
                break

    def _variance(self, r, nr, nr_1):
        r = float(r)
        nr = float(nr)
        nr_1 = float(nr_1)
        return (r + 1.0)**2 * (nr_1 / nr**2) * (1.0 + nr_1 / nr)

    def _renormalize(self, r, nr):
        prob_cov = 0.0
        for r_, nr_ in zip(r, nr):
            prob_cov  += nr_ * self._prob_measure(r_)
        if prob_cov:
            self._renormal = (1 - self._prob_measure(0)) / prob_cov

    def smoothedNr(self, r):
        return math.exp(self._intercept + self._slope * math.log(r))

    def prob(self, sample):
        count = self._freqdist[sample]
        p = self._prob_measure(count)
        if count == 0:
            if self._bins == self._freqdist.B():
                p = 0.0
            else:
                p = p / (self._bins - self._freqdist.B())
        else:
            p = p * self._renormal
        return p

    def _prob_measure(self, count):
        if count == 0 and self._freqdist.N() == 0 :
            return 1.0
        elif count == 0 and self._freqdist.N() != 0:
            return self._freqdist.Nr(1) / self._freqdist.N()

        if self._switch_at > count:
            Er_1 = self._freqdist.Nr(count+1)
            Er = self._freqdist.Nr(count)
        else:
            Er_1 = self.smoothedNr(count+1)
            Er = self.smoothedNr(count)

        r_star = (count + 1) * Er_1 / Er
        return r_star / self._freqdist.N()

    def discount(self):
        return self.smoothedNr(1) / self._freqdist.N()

    def max(self):
        return self._freqdist.max()

    def samples(self):
        return self._freqdist.keys()

    def freqdist(self):
        return self._freqdist

    def __repr__(self):
        return '<SimpleGoodTuringProbDist based on %d samples>'\
                % self._freqdist.N()


class MutableProbDist(ProbDistI):
    def __init__(self, prob_dist, samples, store_logs=True):
        self._samples = samples
        self._sample_dict = dict((samples[i], i) for i in range(len(samples)))
        self._data = array.array(str("d"), [0.0]) * len(samples)
        for i in range(len(samples)):
            if store_logs:
                self._data[i] = prob_dist.logprob(samples[i])
            else:
                self._data[i] = prob_dist.prob(samples[i])
        self._logs = store_logs

    def samples(self):
        return self._samples

    def prob(self, sample):
        i = self._sample_dict.get(sample)
        if i is None:
            return 0.0
        return (2**(self._data[i]) if self._logs else self._data[i])

    def logprob(self, sample):
        i = self._sample_dict.get(sample)
        if i is None:
            return float('-inf')
        return (self._data[i] if self._logs else math.log(self._data[i], 2))

    def update(self, sample, prob, log=True):
        i = self._sample_dict.get(sample)
        assert i is not None
        if self._logs:
            self._data[i] = (prob if log else math.log(prob, 2))
        else:
            self._data[i] = (2**(prob) if log else prob)


##/////////////////////////////////////////////////////
##  Kneser-Ney Probability Distribution
##//////////////////////////////////////////////////////

@compat.python_2_unicode_compatible
class KneserNeyProbDist(ProbDistI):
    def __init__(self, freqdist, bins=None, discount=0.75):
        if not bins:
            self._bins = freqdist.B()
        else:
            self._bins = bins
        self._D = discount

        self._cache = {}
        self._bigrams = defaultdict(int)
        self._trigrams = freqdist

        self._wordtypes_after = defaultdict(float)
        self._trigrams_contain = defaultdict(float)
        self._wordtypes_before = defaultdict(float)
        for w0, w1, w2 in freqdist:
            self._bigrams[(w0,w1)] += freqdist[(w0, w1, w2)]
            self._wordtypes_after[(w0,w1)] += 1
            self._trigrams_contain[w1] += 1
            self._wordtypes_before[(w1,w2)] += 1

    def prob(self, trigram):
        if len(trigram) != 3:
            raise ValueError('Expected an iterable with 3 members.')
        trigram = tuple(trigram)
        w0, w1, w2 = trigram

        if trigram in self._cache:
            return self._cache[trigram]
        else:
            if trigram in self._trigrams:
                prob = (self._trigrams[trigram] - self.discount())/self._bigrams[(w0, w1)]
            elif (w0,w1) in self._bigrams and (w1,w2) in self._wordtypes_before:
                aftr = self._wordtypes_after[(w0, w1)]
                bfr = self._wordtypes_before[(w1, w2)]
                leftover_prob = ((aftr * self.discount()) / self._bigrams[(w0, w1)])
                beta = bfr /(self._trigrams_contain[w1] - aftr)
                prob = leftover_prob * beta
            else:
                prob = 0.0
            self._cache[trigram] = prob
            return prob

    def discount(self):
        return self._D

    def set_discount(self, discount):
        self._D = discount

    def samples(self):
        return self._trigrams.keys()

    def max(self):
        return self._trigrams.max()

    def __repr__(self):
        return '<KneserNeyProbDist based on {0} trigrams'.format(self._trigrams.N())


##//////////////////////////////////////////////////////
##  Probability Distribution Operations
##//////////////////////////////////////////////////////

def log_likelihood(test_pdist, actual_pdist):
    if (not isinstance(test_pdist, ProbDistI) or
        not isinstance(actual_pdist, ProbDistI)):
        raise ValueError('expected a ProbDist.')
    return sum(actual_pdist.prob(s) * math.log(test_pdist.prob(s), 2)
               for s in actual_pdist)

def entropy(pdist):
    probs = (pdist.prob(s) for s in pdist.samples())
    return -sum(p * math.log(p,2) for p in probs)


##//////////////////////////////////////////////////////
##  Conditional Distributions
##//////////////////////////////////////////////////////

@compat.python_2_unicode_compatible
class ConditionalFreqDist(defaultdict):
    def __init__(self, cond_samples=None):
        defaultdict.__init__(self, FreqDist)
        if cond_samples:
            for (cond, sample) in cond_samples:
                self[cond][sample] += 1

    def __reduce__(self):
        kv_pairs = ((cond, self[cond]) for cond in self.conditions())
        return (self.__class__, (), None, None, kv_pairs)

    def conditions(self):
        return list(self.keys())

    def N(self):
        return sum(fdist.N() for fdist in compat.itervalues(self))

    def plot(self, *args, **kwargs):
        try:
            from matplotlib import pylab
        except ImportError:
            raise ValueError('The plot function requires matplotlib to be installed.'
                         'See http://matplotlib.org/')

        cumulative = _get_kwarg(kwargs, 'cumulative', False)
        conditions = _get_kwarg(kwargs, 'conditions', sorted(self.conditions()))
        title = _get_kwarg(kwargs, 'title', '')
        samples = _get_kwarg(kwargs, 'samples',
                             sorted(set(v for c in conditions for v in self[c])))
        if not "linewidth" in kwargs:
            kwargs["linewidth"] = 2

        for condition in conditions:
            if cumulative:
                freqs = list(self[condition]._cumulative_frequencies(samples))
                ylabel = "Cumulative Counts"
                legend_loc = 'lower right'
            else:
                freqs = [self[condition][sample] for sample in samples]
                ylabel = "Counts"
                legend_loc = 'upper right'
            kwargs['label'] = "%s" % condition
            pylab.plot(freqs, *args, **kwargs)

        pylab.legend(loc=legend_loc)
        pylab.grid(True, color="silver")
        pylab.xticks(range(len(samples)), [compat.text_type(s) for s in samples], rotation=90)
        if title:
            pylab.title(title)
        pylab.xlabel("Samples")
        pylab.ylabel(ylabel)
        pylab.show()

    def tabulate(self, *args, **kwargs):
        cumulative = _get_kwarg(kwargs, 'cumulative', False)
        conditions = _get_kwarg(kwargs, 'conditions', sorted(self.conditions()))
        samples = _get_kwarg(kwargs, 'samples',
                             sorted(set(v for c in conditions for v in self[c])))

        width = max(len("%s" % s) for s in samples)
        freqs = dict()
        for c in conditions:
            if cumulative:
                freqs[c] = list(self[c]._cumulative_frequencies(samples))
            else:
                freqs[c] = [self[c][sample] for sample in samples]
            width = max(width, max(len("%d" % f) for f in freqs[c]))

        condition_size = max(len("%s" % c) for c in conditions)
        print(' ' * condition_size, end=' ')
        for s in samples:
            print("%*s" % (width, s), end=' ')
        print()
        for c in conditions:
            print("%*s" % (condition_size, c), end=' ')
            for f in freqs[c]:
                print("%*d" % (width, f), end=' ')
            print()

    def __add__(self, other):
        if not isinstance(other, ConditionalFreqDist):
            return NotImplemented
        result = ConditionalFreqDist()
        for cond in self.conditions():
            newfreqdist = self[cond] + other[cond]
            if newfreqdist:
                result[cond] = newfreqdist
        for cond in other.conditions():
            if cond not in self.conditions():
                for elem, count in other[cond].items():
                    if count > 0:
                        result[cond][elem] = count
        return result

    def __sub__(self, other):
        if not isinstance(other, ConditionalFreqDist):
            return NotImplemented
        result = ConditionalFreqDist()
        for cond in self.conditions():
            newfreqdist = self[cond] - other[cond]
            if newfreqdist:
                result[cond] = newfreqdist
        for cond in other.conditions():
            if cond not in self.conditions():
                for elem, count in other[cond].items():
                    if count < 0:
                        result[cond][elem] = 0 - count
        return result

    def __or__(self, other):
        if not isinstance(other, ConditionalFreqDist):
            return NotImplemented
        result = ConditionalFreqDist()
        for cond in self.conditions():
            newfreqdist = self[cond] | other[cond]
            if newfreqdist:
                result[cond] = newfreqdist
        for cond in other.conditions():
            if cond not in self.conditions():
                for elem, count in other[cond].items():
                    if count > 0:
                        result[cond][elem] = count
        return result

    def __and__(self, other):
        if not isinstance(other, ConditionalFreqDist):
            return NotImplemented
        result = ConditionalFreqDist()
        for cond in self.conditions():
            newfreqdist = self[cond] & other[cond]
            if newfreqdist:
                result[cond] = newfreqdist
        return result

    def __le__(self, other):
        if not isinstance(other, ConditionalFreqDist):
            raise_unorderable_types("<=", self, other)
        return set(self.conditions()).issubset(other.conditions()) \
               and all(self[c] <= other[c] for c in self.conditions())

    def __lt__(self, other):
        if not isinstance(other, ConditionalFreqDist):
            raise_unorderable_types("<", self, other)
        return self <= other and self != other

    def __ge__(self, other):
        if not isinstance(other, ConditionalFreqDist):
            raise_unorderable_types(">=", self, other)
        return other <= self

    def __gt__(self, other):
        if not isinstance(other, ConditionalFreqDist):
            raise_unorderable_types(">", self, other)
        return other < self

    def __repr__(self):
        return '<ConditionalFreqDist with %d conditions>' % len(self)


@compat.python_2_unicode_compatible
class ConditionalProbDistI(dict):
    def __init__(self):
        raise NotImplementedError("Interfaces can't be instantiated")

    def conditions(self):
        return list(self.keys())

    def __repr__(self):
        return '<%s with %d conditions>' % (type(self).__name__, len(self))


class ConditionalProbDist(ConditionalProbDistI):
    def __init__(self, cfdist, probdist_factory,
                 *factory_args, **factory_kw_args):
        self._probdist_factory = probdist_factory
        self._factory_args = factory_args
        self._factory_kw_args = factory_kw_args

        for condition in cfdist:
            self[condition] = probdist_factory(cfdist[condition],
                                               *factory_args, **factory_kw_args)

    def __missing__(self, key):
        self[key] = self._probdist_factory(FreqDist(),
                                           *self._factory_args,
                                           **self._factory_kw_args)
        return self[key]

class DictionaryConditionalProbDist(ConditionalProbDistI):
    def __init__(self, probdist_dict):
        self.update(probdist_dict)

    def __missing__(self, key):
        self[key] = DictionaryProbDist()
        return self[key]


##//////////////////////////////////////////////////////
## Adding in log-space.
##//////////////////////////////////////////////////////

_ADD_LOGS_MAX_DIFF = math.log(1e-30, 2)

def add_logs(logx, logy):
    if (logx < logy + _ADD_LOGS_MAX_DIFF):
        return logy
    if (logy < logx + _ADD_LOGS_MAX_DIFF):
        return logx
    base = min(logx, logy)
    return base + math.log(2**(logx-base) + 2**(logy-base), 2)

def sum_logs(logs):
    return (reduce(add_logs, logs[1:], logs[0]) if len(logs) != 0 else _NINF)


##//////////////////////////////////////////////////////
##  Probabilistic Mix-in
##//////////////////////////////////////////////////////

class ProbabilisticMixIn(object):
    def __init__(self, **kwargs):
        if 'prob' in kwargs:
            if 'logprob' in kwargs:
                raise TypeError('Must specify either prob or logprob '
                                '(not both)')
            else:
                ProbabilisticMixIn.set_prob(self, kwargs['prob'])
        elif 'logprob' in kwargs:
            ProbabilisticMixIn.set_logprob(self, kwargs['logprob'])
        else:
            self.__prob = self.__logprob = None

    def set_prob(self, prob):
        self.__prob = prob
        self.__logprob = None

    def set_logprob(self, logprob):
        self.__logprob = logprob
        self.__prob = None

    def prob(self):
        if self.__prob is None:
            if self.__logprob is None: return None
            self.__prob = 2**(self.__logprob)
        return self.__prob

    def logprob(self):
        if self.__logprob is None:
            if self.__prob is None: return None
            self.__logprob = math.log(self.__prob, 2)
        return self.__logprob

class ImmutableProbabilisticMixIn(ProbabilisticMixIn):
    def set_prob(self, prob):
        raise ValueError('%s is immutable' % self.__class__.__name__)
    def set_logprob(self, prob):
        raise ValueError('%s is immutable' % self.__class__.__name__)


def _get_kwarg(kwargs, key, default):
    if key in kwargs:
        arg = kwargs[key]
        del kwargs[key]
    else:
        arg = default
    return arg


##//////////////////////////////////////////////////////
##  Demonstration
##//////////////////////////////////////////////////////

def _create_rand_fdist(numsamples, numoutcomes):
    import random
    fdist = FreqDist()
    for x in range(numoutcomes):
        y = (random.randint(1, (1 + numsamples) // 2) +
             random.randint(0, numsamples // 2))
        fdist[y] += 1
    return fdist

def _create_sum_pdist(numsamples):
    fdist = FreqDist()
    for x in range(1, (1 + numsamples) // 2 + 1):
        for y in range(0, numsamples // 2 + 1):
            fdist[x+y] += 1
    return MLEProbDist(fdist)

def demo(numsamples=6, numoutcomes=500):
    fdist1 = _create_rand_fdist(numsamples, numoutcomes)
    fdist2 = _create_rand_fdist(numsamples, numoutcomes)
    fdist3 = _create_rand_fdist(numsamples, numoutcomes)

    pdists = [
        MLEProbDist(fdist1),
        LidstoneProbDist(fdist1, 0.5, numsamples),
        HeldoutProbDist(fdist1, fdist2, numsamples),
        HeldoutProbDist(fdist2, fdist1, numsamples),
        CrossValidationProbDist([fdist1, fdist2, fdist3], numsamples),
        SimpleGoodTuringProbDist(fdist1),
        SimpleGoodTuringProbDist(fdist1, 7),
        _create_sum_pdist(numsamples),
    ]

    vals = []
    for n in range(1,numsamples+1):
        vals.append(tuple([n, fdist1.freq(n)] +
                          [pdist.prob(n) for pdist in pdists]))

    print(('%d samples (1-%d); %d outcomes were sampled for each FreqDist' %
           (numsamples, numsamples, numoutcomes)))
    print('='*9*(len(pdists)+2))
    FORMATSTR = '      FreqDist '+ '%8s '*(len(pdists)-1) + '|  Actual'
    print(FORMATSTR % tuple(repr(pdist)[1:9] for pdist in pdists[:-1]))
    print('-'*9*(len(pdists)+2))
    FORMATSTR = '%3d   %8.6f ' + '%8.6f '*(len(pdists)-1) + '| %8.6f'
    for val in vals:
        print(FORMATSTR % val)

    zvals = list(zip(*vals))
    sums = [sum(val) for val in zvals[1:]]
    print('-'*9*(len(pdists)+2))
    FORMATSTR = 'Total ' + '%8.6f '*(len(pdists)) + '| %8.6f'
    print(FORMATSTR % tuple(sums))
    print('='*9*(len(pdists)+2))

    if len("%s" % fdist1) < 70:
        print('  fdist1: %s' % fdist1)
        print('  fdist2: %s' % fdist2)
        print('  fdist3: %s' % fdist3)
    print()

    print('Generating:')
    for pdist in pdists:
        fdist = FreqDist(pdist.generate() for i in range(5000))
        print('%20s %s' % (pdist.__class__.__name__[:20], ("%s" % fdist)[:55]))
    print()

def gt_demo():
    from nltk import corpus
    emma_words = corpus.gutenberg.words('austen-emma.txt')
    fd = FreqDist(emma_words)
    sgt = SimpleGoodTuringProbDist(fd)
    print('%18s %8s  %14s' \
        % ("word", "freqency", "SimpleGoodTuring"))
    fd_keys_sorted=(key for key, value in sorted(fd.items(), key=lambda item: item[1], reverse=True))
    for key in fd_keys_sorted:
        print('%18s %8d  %14e' \
            % (key, fd[key], sgt.prob(key)))

if __name__ == '__main__':
    demo(6, 10)
    demo(5, 5000)
    gt_demo()

__all__ = ['ConditionalFreqDist', 'ConditionalProbDist',
           'ConditionalProbDistI', 'CrossValidationProbDist',
           'DictionaryConditionalProbDist', 'DictionaryProbDist', 'ELEProbDist',
           'FreqDist', 'SimpleGoodTuringProbDist', 'HeldoutProbDist',
           'ImmutableProbabilisticMixIn', 'LaplaceProbDist', 'LidstoneProbDist',
           'MLEProbDist', 'MutableProbDist', 'KneserNeyProbDist', 'ProbDistI', 'ProbabilisticMixIn',
           'UniformProbDist', 'WittenBellProbDist', 'add_logs',
           'log_likelihood', 'sum_logs', 'entropy']