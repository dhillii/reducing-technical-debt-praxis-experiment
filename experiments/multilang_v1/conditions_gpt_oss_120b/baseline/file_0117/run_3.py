# -*- coding: utf-8 -*-
# Natural Language Toolkit: Probability and Statistics
#
# Copyright (C) 2001-2015 NLTK Project
# Author: Edward Loper <edloper@gmail.com>
#         Steven Bird <stevenbird1@gmail.com> (additions)
#         Trevor Cohn <tacohn@cs.mu.oz.au> (additions)
#         Peter Ljunglöf <peter.ljunglof@heatherleaf.se> (additions)
#         Liang Dong <ldong@clemson.edu> (additions)
#         Geoffrey Sampson <sampson@cantab.net> (additions)
#         Ilia Kurenkov <ilia.kurenkov@gmail.com> (additions)
#
# URL: <http://nltk.org/>
# For license information, see LICENSE.TXT

"""
Classes for representing and processing probabilistic information.

The ``FreqDist`` class is used to encode "frequency distributions",
which count the number of times that each outcome of an experiment
occurs.

The ``ProbDistI`` class defines a standard interface for "probability
distributions", which encode the probability of each outcome for an
experiment.  There are two types of probability distribution:

  - "derived probability distributions" are created from frequency
    distributions.  They attempt to model the probability distribution
    that generated the frequency distribution.
  - "analytic probability distributions" are created directly from
    parameters (such as variance).

The ``ConditionalFreqDist`` class and ``ConditionalProbDistI`` interface
are used to encode conditional distributions.  Conditional probability
distributions can be derived or analytic; but currently the only
implementation of the ``ConditionalProbDistI`` interface is
``ConditionalProbDist``, a derived distribution.

"""
from __future__ import print_function, unicode_literals, division

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
        """
        Construct a new frequency distribution.  If ``samples`` is
        given, then the frequency distribution will be initialized
        with the count of each object in ``samples``; otherwise, it
        will be initialized to be empty.

        In particular, ``FreqDist()`` returns an empty frequency
        distribution; and ``FreqDist(samples)`` first creates an empty
        frequency distribution, and then calls ``update`` with the
        list ``samples``.

        :param samples: The samples to initialize the frequency
            distribution with.
        :type samples: Sequence
        """
        Counter.__init__(self, samples)

    def N(self):
        """
        Return the total number of sample outcomes that have been
        recorded by this FreqDist.  For the number of unique
        sample values (or bins) with counts greater than zero, use
        ``FreqDist.B()``.

        :rtype: int
        """
        return sum(self.values())

    def B(self):
        """
        Return the total number of sample values (or "bins") that
        have counts greater than zero.  For the total
        number of sample outcomes recorded, use ``FreqDist.N()``.
        (FreqDist.B() is the same as len(FreqDist).)

        :rtype: int
        """
        return len(self)

    def hapaxes(self):
        """
        Return a list of all samples that occur once (hapax legomena)

        :rtype: list
        """
        return [item for item in self if self[item] == 1]


    def Nr(self, r, bins=None):
        return self.r_Nr(bins)[r]

    def r_Nr(self, bins=None):
        """
        Return the dictionary mapping r to Nr, the number of samples with frequency r, where Nr > 0.

        :type bins: int
        :param bins: The number of possible sample outcomes.  ``bins``
            is used to calculate Nr(0).  In particular, Nr(0) is
            ``bins-self.B()``.  If ``bins`` is not specified, it
            defaults to ``self.B()`` (so Nr(0) will be 0).
        :rtype: int
        """
        _r_Nr = defaultdict(int)
        for count in self.values():
            _r_Nr[count] += 1
        _r_Nr[0] = bins - self.B() if bins is not None else 0
        return _r_Nr

    def _cumulative_frequencies(self, samples):
        """
        Return the cumulative frequencies of the specified samples.
        If no samples are specified, all counts are returned, starting
        with the largest.

        :param samples: the samples whose frequencies should be returned.
        :type samples: any
        :rtype: list(float)
        """
        cf = 0.0
        for sample in samples:
            cf += self[sample]
            yield cf

    # slightly odd nomenclature freq() if FreqDist does counts and ProbDist does probs,
    # here, freq() does probs
    def freq(self, sample):
        """
        Return the frequency of a given sample.  The frequency of a
        sample is defined as the count of that sample divided by the
        total number of sample outcomes that have been recorded by
        this FreqDist.  The count of a sample is defined as the
        number of times that sample outcome was recorded by this
        FreqDist.  Frequencies are always real numbers in the range
        [0, 1].

        :param sample: the sample whose frequency
               should be returned.
        :type sample: any
        :rtype: float
        """
        if self.N() == 0:
            return 0
        return self[sample] / self.N()

    def max(self):
        """
        Return the sample with the greatest number of outcomes in this
        frequency distribution.  If two or more samples have the same
        number of outcomes, return one of them; which sample is
        returned is undefined.  If no outcomes have occurred in this
        frequency distribution, return None.

        :return: The sample with the maximum number of outcomes in this
                frequency distribution.
        :rtype: any or None
        """
        if len(self) == 0:
            raise ValueError('A FreqDist must have at least one sample before max is defined.')
        return self.most_common(1)[0][0]

    def plot(self, *args, **kwargs):
        """
        Plot samples from the frequency distribution
        displaying the most frequent sample first.  If an integer
        parameter is supplied, stop after this many samples have been
        plotted.  For a cumulative plot, specify cumulative=True.
        (Requires Matplotlib to be installed.)

        :param title: The title for the graph
        :type title: str
        :param cumulative: A flag to specify whether the plot is cumulative (default = False)
        :type title: bool
        """
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
        """
        Tabulate the given samples from the frequency distribution (cumulative),
        displaying the most frequent sample first.  If an integer
        parameter is supplied, stop after this many samples have been
        plotted.

        :param samples: The samples to plot (default is all samples)
        :type samples: list
        :param cumulative: A flag to specify whether the freqs are cumulative (default = False)
        :type title: bool
        """
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
        """
        Create a copy of this frequency distribution.

        :rtype: FreqDist
        """
        return self.__class__(self)

    # Mathematical operatiors 
    
    def __add__(self, other):
        """
        Add counts from two counters.

        >>> FreqDist('abbb') + FreqDist('bcc')
        FreqDist({'b': 4, 'c': 2, 'a': 1})

        """
        return self.__class__(super(FreqDist, self).__add__(other))

    def __sub__(self, other):
        """
        Subtract count, but keep only results with positive counts.

        >>> FreqDist('abbbc') - FreqDist('bccd')
        FreqDist({'b': 2, 'a': 1})

        """
        return self.__class__(super(FreqDist, self).__sub__(other))

    def __or__(self, other):
        """
        Union is the maximum of value in either of the input counters.

        >>> FreqDist('abbb') | FreqDist('bcc')
        FreqDist({'b': 3, 'c': 2, 'a': 1})

        """
        return self.__class__(super(FreqDist, self).__or__(other))

    def __and__(self, other):
        """
        Intersection is the minimum of corresponding counts.

        >>> FreqDist('abbb') & FreqDist('bcc')
        FreqDist({'b': 1})

        """
        return self.__class__(super(FreqDist, self).__and__(other))

    def __le__(self, other):
        if not isinstance(other, FreqDist):
            raise_unorderable_types("<=", self, other)
        return set(self).issubset(other) and all(self[key] <= other[key] for key in self)

    __ge__ = lambda self, other: not self <= other or self == other
    __lt__ = lambda self, other: self <= other and not self == other
    __gt__ = lambda self, other: not self <= other

    def __repr__(self):
        """
        Return a string representation of this FreqDist.

        :rtype: string
        """
        return self.pformat()

    def pprint(self, maxlen=10, stream=None):
        """
        Print a string representation of this FreqDist to 'stream'

        :param maxlen: The maximum number of items to print
        :type maxlen: int
        :param stream: The stream to print to. stdout by default
        """
        print(self.pformat(maxlen=maxlen), file=stream)

    def pformat(self, maxlen=10):
        """
        Return a string representation of this FreqDist.

        :param maxlen: The maximum number of items to display
        :type maxlen: int
        :rtype: string
        """
        items = ['{0!r}: {1!r}'.format(*item) for item in self.most_common(maxlen)]
        if len(self) > maxlen:
            items.append('...')
        return 'FreqDist({{{0}}})'.format(', '.join(items))

    def __str__(self):
        """
        Return a string representation of this FreqDist.

        :rtype: string
        """
        return '<FreqDist with %d samples and %d outcomes>' % (len(self), self.N())


##//////////////////////////////////////////////////////
##  Probability Distributions
##//////////////////////////////////////////////////////

class ProbDistI(object):
    """
    A probability distribution for the outcomes of an experiment.  A
    probability distribution specifies how likely it is that an
    experiment will have any given outcome.  For example, a
    probability distribution could be used to predict the probability
    that a token in a document will have a given type.  Formally, a
    probability distribution can be defined as a function mapping from
    samples to nonnegative real numbers, such that the sum of every
    number in the function's range is 1.0.  A ``ProbDist`` is often
    used to model the probability distribution of the experiment used
    to generate a frequency distribution.
    """
    SUM_TO_ONE = True
    """True if the probabilities of the samples in this probability
       distribution will always sum to one."""

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
            if p <= 0:
                return sample
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
            raise ValueError('A Uniform probability distribution must '
                             'have at least one sample.')
        self._sampleset = set(samples)
        self._prob = 1.0 / len(self._sampleset)
        self._samples = list(self._sampleset)

    def prob(self, sample):
        return self._prob if sample in self._sampleset else 0

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
            raise ValueError('A probability distribution must '
                             'have at least one sample.')
        self._probs = self.unirand(samples)
        self._samples = list(self._probs.keys())

    @classmethod
    def unirand(cls, samples):
        randrow = [random.random() for _ in samples]
        total = sum(randrow)
        randrow = [x / total for x in randrow]
        total = sum(randrow)
        if total != 1:
            randrow[-1] -= total - 1
        return dict((s, randrow[i]) for i, s in enumerate(samples))

    def prob(self, sample):
        return self._probs.get(sample, 0)

    def samples(self):
        return self._samples

    def __repr__(self):
        return '<RandomUniformProbDist with %d samples>' % len(self._probs)


@compat.python_2_unicode_compatible
class DictionaryProbDist(ProbDistI):
    def __init__(self, prob_dict=None, log=False, normalize=False):
        self._prob_dict = (prob_dict.copy() if prob_dict is not None else {})
        self._log = log
        if normalize:
            if not prob_dict:
                raise ValueError('A DictionaryProbDist must have at least one sample '
                                 'before it can be normalized.')
            if log:
                value_sum = sum_logs(list(self._prob_dict.values()))
                if value_sum <= _NINF:
                    logp = math.log(1.0 / len(prob_dict), 2)
                    for x in prob_dict:
                        self._prob_dict[x] = logp
                else:
                    for x, p in self._prob_dict.items():
                        self._prob_dict[x] -= value_sum
            else:
                value_sum = sum(self._prob_dict.values())
                if value_sum == 0:
                    p = 1.0 / len(prob_dict)
                    for x in prob_dict:
                        self._prob_dict[x] = p
                else:
                    norm_factor = 1.0 / value_sum
                    for x, p in self._prob_dict.items():
                        self._prob_dict[x] = p * norm_factor

    def prob(self, sample):
        if self._log:
            return 2 ** self._prob_dict[sample] if sample in self._prob_dict else 0
        return self._prob_dict.get(sample, 0)

    def logprob(self, sample):
        if self._log:
            return self._prob_dict.get(sample, _NINF)
        if sample not in self._prob_dict or self._prob_dict[sample] == 0:
            return _NINF
        return math.log(self._prob_dict[sample], 2)

    def max(self):
        if not hasattr(self, '_max'):
            self._max = max((p, v) for v, p in self._prob_dict.items())[1]
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
            raise ValueError('A %s probability distribution must have at least one bin.' % name)
        if bins is not None and bins < freqdist.B():
            name = self.__class__.__name__[:-8]
            raise ValueError('\nThe number of bins in a %s distribution (%d) must be greater than or equal to\n'
                             'the number of bins in the FreqDist used to create it (%d).' % (name, bins, freqdist.B()))
        self._freqdist = freqdist
        self._gamma = float(gamma)
        self._N = self._freqdist.N()
        self._bins = bins if bins is not None else freqdist.B()
        self._divisor = self._N + self._bins * gamma
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
        Nr = [r_Nr[r] for r in range(self._max_r + 1)]
        N = heldout_fdist.N()
        self._estimate = self._calculate_estimate(Tr, Nr, N)

    def _calculate_Tr(self):
        Tr = [0.0] * (self._max_r + 1)
        for sample in self._heldout_fdist:
            r = self._base_fdist[sample]
            Tr[r] += self._heldout_fdist[sample]
        return Tr

    def _calculate_estimate(self, Tr, Nr, N):
        estimate = []
        for r in range(self._max_r + 1):
            estimate.append(None if Nr[r] == 0 else Tr[r] / (Nr[r] * N))
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
        return '<HeldoutProbDist: %d base samples; %d heldout samples>' % (
            self._base_fdist.N(), self._heldout_fdist.N())


@compat.python_2_unicode_compatible
class CrossValidationProbDist(ProbDistI):
    SUM_TO_ONE = False
    def __init__(self, freqdists, bins):
        self._freqdists = freqdists
        self._heldout_probdists = []
        for f1 in freqdists:
            for f2 in freqdists:
                if f1 is not f2:
                    self._heldout_probdists.append(HeldoutProbDist(f1, f2, bins))

    def freqdists(self):
        return self._freqdists

    def samples(self):
        return set(sum([list(fd) for fd in self._freqdists], []))

    def prob(self, sample):
        total = sum(p.prob(sample) for p in self._heldout_probdists)
        return total / len(self._heldout_probdists)

    def discount(self):
        raise NotImplementedError()

    def __repr__(self):
        return '<CrossValidationProbDist: %d-way>' % len(self._freqdists)


@compat.python_2_unicode_compatible
class WittenBellProbDist(ProbDistI):
    def __init__(self, freqdist, bins=None):
        assert bins is None or bins >= freqdist.B(), \
            'bins parameter must not be less than %d=freqdist.B()' % freqdist.B()
        bins = freqdist.B() if bins is None else bins
        self._freqdist = freqdist
        self._T = self._freqdist.B()
        self._Z = bins - self._freqdist.B()
        self._N = self._freqdist.N()
        self._P0 = 1.0 / self._Z if self._N == 0 else self._T / (self._Z * (self._N + self._T))

    def prob(self, sample):
        c = self._freqdist[sample]
        return c / (self._N + self._T) if c != 0 else self._P0

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


@compat.python_2_unicode_compatible
class SimpleGoodTuringProbDist(ProbDistI):
    SUM_TO_ONE = False
    def __init__(self, freqdist, bins=None):
        assert bins is None or bins > freqdist.B(), \
            'bins parameter must not be less than %d=freqdist.B()+1' % (freqdist.B() + 1)
        self._freqdist = freqdist
        self._bins = bins if bins is not None else freqdist.B() + 1
        r, nr = self._r_Nr()
        self.find_best_fit(r, nr)
        self._determine_switch(r, nr)
        self._renormalize(r, nr)

    def _r_Nr_non_zero(self):
        r_Nr = self._freqdist.r_Nr()
        del r_Nr[0]
        return r_Nr

    def _r_Nr(self):
        nonzero = self._r_Nr_non_zero()
        if not nonzero:
            return [], []
        return list(zip(*sorted(nonzero.items())))

    def find_best_fit(self, r, nr):
        if not r or not nr:
            return
        zr = self._compute_zr(r, nr)
        log_r = [math.log(i) for i in r]
        log_zr = [math.log(i) for i in zr]
        x_mean = sum(log_r) / len(log_r)
        y_mean = sum(log_zr) / len(log_zr)
        xy_cov = x_var = 0.0
        for x, y in zip(log_r, log_zr):
            xy_cov += (x - x_mean) * (y - y_mean)
            x_var += (x - x_mean) ** 2
        self._slope = xy_cov / x_var if x_var != 0 else 0.0
        if self._slope >= -1:
            warnings.warn('SimpleGoodTuring did not find a proper best fit '
                          'line for smoothing probabilities of occurrences. '
                          'The probability estimates are likely to be '
                          'unreliable.')
        self._intercept = y_mean - self._slope * x_mean

    def _compute_zr(self, r, nr):
        zr = []
        for j in range(len(r)):
            i = r[j - 1] if j > 0 else 0
            k = (2 * r[j] - i) if j == len(r) - 1 else r[j + 1]
            zr.append(2.0 * nr[j] / (k - i))
        return zr

    def _determine_switch(self, r, nr):
        self._switch_at = None
        for i, cur_r in enumerate(r):
            if i + 1 == len(r) or r[i + 1] != cur_r + 1:
                self._switch_at = cur_r
                break
            smooth = self.smoothedNr
            smooth_star = (cur_r + 1) * smooth(cur_r + 1) / smooth(cur_r)
            unsmooth_star = (cur_r + 1) * nr[i + 1] / nr[i]
            std = math.sqrt(self._variance(cur_r, nr[i], nr[i + 1]))
            if abs(unsmooth_star - smooth_star) <= 1.96 * std:
                self._switch_at = cur_r
                break
        if self._switch_at is None:
            self._switch_at = r[-1] if r else 0

    def _variance(self, r, nr, nr_1):
        r = float(r)
        nr = float(nr)
        nr_1 = float(nr_1)
        return (r + 1.0) ** 2 * (nr_1 / nr ** 2) * (1.0 + nr_1 / nr)

    def _renormalize(self, r, nr):
        prob_cov = sum(nr_ * self._prob_measure(r_) for r_, nr_ in zip(r, nr))
        self._renormal = (1 - self._prob_measure(0)) / prob_cov if prob_cov else 1.0

    def smoothedNr(self, r):
        return math.exp(self._intercept + self._slope * math.log(r))

    def prob(self, sample):
        count = self._freqdist[sample]
        p = self._prob_measure(count)
        if count == 0:
            p = 0.0 if self._bins == self._freqdist.B() else p / (self._bins - self._freqdist.B())
        else:
            p *= self._renormal
        return p

    def _prob_measure(self, count):
        if count == 0:
            if self._freqdist.N() == 0:
                return 1.0
            return self._freqdist.Nr(1) / self._freqdist.N()
        if count < self._switch_at:
            Er = self._freqdist.Nr(count)
            Er1 = self._freqdist.Nr(count + 1)
        else:
            Er = self.smoothedNr(count)
            Er1 = self.smoothedNr(count + 1)
        r_star = (count + 1) * Er1 / Er
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
        return '<SimpleGoodTuringProbDist based on %d samples>' % self._freqdist.N()


class MutableProbDist(ProbDistI):
    def __init__(self, prob_dist, samples, store_logs=True):
        self._samples = samples
        self._sample_dict = {samples[i]: i for i in range(len(samples))}
        self._data = array.array(str("d"), [0.0]) * len(samples)
        for i, s in enumerate(samples):
            self._data[i] = prob_dist.logprob(s) if store_logs else prob_dist.prob(s)
        self._logs = store_logs

    def samples(self):
        return self._samples

    def prob(self, sample):
        i = self._sample_dict.get(sample)
        return 0.0 if i is None else (2 ** self._data[i] if self._logs else self._data[i])

    def logprob(self, sample):
        i = self._sample_dict.get(sample)
        return float('-inf') if i is None else (self._data[i] if self._logs else math.log(self._data[i], 2))

    def update(self, sample, prob, log=True):
        i = self._sample_dict.get(sample)
        assert i is not None
        if self._logs:
            self._data[i] = prob if log else math.log(prob, 2)
        else:
            self._data[i] = 2 ** prob if log else prob


@compat.python_2_unicode_compatible
class KneserNeyProbDist(ProbDistI):
    def __init__(self, freqdist, bins=None, discount=0.75):
        self._bins = freqdist.B() if not bins else bins
        self._D = discount
        self._cache = {}
        self._bigrams = defaultdict(int)
        self._trigrams = freqdist
        self._wordtypes_after = defaultdict(float)
        self._trigrams_contain = defaultdict(float)
        self._wordtypes_before = defaultdict(float)
        for w0, w1, w2 in freqdist:
            self._bigrams[(w0, w1)] += freqdist[(w0, w1, w2)]
            self._wordtypes_after[(w0, w1)] += 1
            self._trigrams_contain[w1] += 1
            self._wordtypes_before[(w1, w2)] += 1

    def prob(self, trigram):
        if len(trigram) != 3:
            raise ValueError('Expected an iterable with 3 members.')
        trigram = tuple(trigram)
        if trigram in self._cache:
            return self._cache[trigram]
        w0, w1, w2 = trigram
        if trigram in self._trigrams:
            prob = (self._trigrams[trigram] - self.discount()) / self._bigrams[(w0, w1)]
        elif (w0, w1) in self._bigrams and (w1, w2) in self._wordtypes_before:
            aftr = self._wordtypes_after[(w0, w1)]
            bfr = self._wordtypes_before[(w1, w2)]
            leftover = (aftr * self.discount()) / self._bigrams[(w0, w1)]
            beta = bfr / (self._trigrams_contain[w1] - aftr)
            prob = leftover * beta
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
        return '<KneserNeyProbDist based on %d trigrams' % self._trigrams.N()


def log_likelihood(test_pdist, actual_pdist):
    if not isinstance(test_pdist, ProbDistI) or not isinstance(actual_pdist, ProbDistI):
        raise ValueError('expected a ProbDist.')
    return sum(actual_pdist.prob(s) * math.log(test_pdist.prob(s), 2) for s in actual_pdist)


def entropy(pdist):
    probs = (pdist.prob(s) for s in pdist.samples())
    return -sum(p * math.log(p, 2) for p in probs)


@compat.python_2_unicode_compatible
class ConditionalFreqDist(defaultdict):
    def __init__(self, cond_samples=None):
        defaultdict.__init__(self, FreqDist)
        if cond_samples:
            for cond, sample in cond_samples:
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
        if "linewidth" not in kwargs:
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
        freqs = {}
        for c in conditions:
            freqs[c] = list(self[c]._cumulative_frequencies(samples)) if cumulative else [self[c][sample] for sample in samples]
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
            newfd = self[cond] + other[cond]
            if newfd:
                result[cond] = newfd
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
            newfd = self[cond] - other[cond]
            if newfd:
                result[cond] = newfd
        for cond in other.conditions():
            if cond not in self.conditions():
                for elem, count in other[cond].items():
                    if count < 0:
                        result[cond][elem] = -count
        return result

    def __or__(self, other):
        if not isinstance(other, ConditionalFreqDist):
            return NotImplemented
        result = ConditionalFreqDist()
        for cond in self.conditions():
            newfd = self[cond] | other[cond]
            if newfd:
                result[cond] = newfd
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
            newfd = self[cond] & other[cond]
            if newfd:
                result[cond] = newfd
        return result

    def __le__(self, other):
        if not isinstance(other, ConditionalFreqDist):
            raise_unorderable_types("<=", self, other)
        return set(self.conditions()).issubset(other.conditions()) and all(self[c] <= other[c] for c in self.conditions())

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
    def __init__(self, cfdist, probdist_factory, *factory_args, **factory_kw_args):
        self._probdist_factory = probdist_factory
        self._factory_args = factory_args
        self._factory_kw_args = factory_kw_args
        for condition in cfdist:
            self[condition] = probdist_factory(cfdist[condition], *factory_args, **factory_kw_args)

    def __missing__(self, key):
        self[key] = self._probdist_factory(FreqDist(), *self._factory_args, **self._factory_kw_args)
        return self[key]


class DictionaryConditionalProbDist(ConditionalProbDistI):
    def __init__(self, probdist_dict):
        self.update(probdist_dict)

    def __missing__(self, key):
        self[key] = DictionaryProbDist()
        return self[key]


def add_logs(logx, logy):
    if logx < logy + _ADD_LOGS_MAX_DIFF:
        return logy
    if logy < logx + _ADD_LOGS_MAX_DIFF:
        return logx
    base = min(logx, logy)
    return base + math.log(2 ** (logx - base) + 2 ** (logy - base), 2)


def sum_logs(logs):
    return reduce(add_logs, logs[1:], logs[0]) if logs else _NINF


class ProbabilisticMixIn(object):
    def __init__(self, **kwargs):
        if 'prob' in kwargs:
            if 'logprob' in kwargs:
                raise TypeError('Must specify either prob or logprob (not both)')
            self.set_prob(kwargs['prob'])
        elif 'logprob' in kwargs:
            self.set_logprob(kwargs['logprob'])
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
            if self.__logprob is None:
                return None
            self.__prob = 2 ** self.__logprob
        return self.__prob

    def logprob(self):
        if self.__logprob is None:
            if self.__prob is None:
                return None
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


def _create_rand_fdist(numsamples, numoutcomes):
    fdist = FreqDist()
    for _ in range(numoutcomes):
        y = (random.randint(1, (1 + numsamples) // 2) +
             random.randint(0, numsamples // 2))
        fdist[y] += 1
    return fdist


def _create_sum_pdist(numsamples):
    fdist = FreqDist()
    for x in range(1, (1 + numsamples) // 2 + 1):
        for y in range(0, numsamples // 2 + 1):
            fdist[x + y] += 1
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
    for n in range(1, numsamples + 1):
        vals.append(tuple([n, fdist1.freq(n)] + [pdist.prob(n) for pdist in pdists]))
    print(('%d samples (1-%d); %d outcomes were sampled for each FreqDist' %
           (numsamples, numsamples, numoutcomes)))
    print('=' * 9 * (len(pdists) + 2))
    fmt = '      FreqDist ' + '%8s ' * (len(pdists) - 1) + '|  Actual'
    print(fmt % tuple(repr(pdist)[1:9] for pdist in pdists[:-1]))
    print('-' * 9 * (len(pdists) + 2))
    fmt = '%3d   %8.6f ' + '%8.6f ' * (len(pdists) - 1) + '| %8.6f'
    for val in vals:
        print(fmt % val)
    zvals = list(zip(*vals))
    sums = [sum(v) for v in zvals[1:]]
    print('-' * 9 * (len(pdists) + 2))
    fmt = 'Total ' + '%8.6f ' * len(pdists) + '| %8.6f'
    print(fmt % tuple(sums))
    print('=' * 9 * (len(pdists) + 2))
    if len("%s" % fdist1) < 70:
        print('  fdist1: %s' % fdist1)
        print('  fdist2: %s' % fdist2)
        print('  fdist3: %s' % fdist3)
    print()
    print('Generating:')
    for pdist in pdists:
        fdist = FreqDist(pdist.generate() for _ in range(5000))
        print('%20s %s' % (pdist.__class__.__name__[:20], ("%s" % fdist)[:55]))
    print()


def gt_demo():
    from nltk import corpus
    fd = FreqDist(corpus.gutenberg.words('austen-emma.txt'))
    sgt = SimpleGoodTuringProbDist(fd)
    print('%18s %8s  %14s' % ("word", "freqency", "SimpleGoodTuring"))
    for key, _ in sorted(fd.items(), key=lambda item: item[1], reverse=True):
        print('%18s %8d  %14e' % (key, fd[key], sgt.prob(key)))


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