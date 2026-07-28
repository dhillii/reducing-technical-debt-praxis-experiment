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
    an experiment occurs.  For example, a frequency distribution
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

        # Special case for Nr[0]:
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
        # percents = [f * 100 for f in freqs]  only in ProbDist?

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
        # percents = [f * 100 for f in freqs]  only in ProbDist?

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

    # @total_ordering doesn't work here, since the class inherits from a builtin class
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
            self._prob_dict = (prob_dict.copy() if prob_dict is not None else {})
        if self._log = log

        # Normalize the distribution, if requested.
        if normalize:
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
        self._prob_dict = prob_dict.copy() if prob_dict else {}
        self._log = log
        if normalize:
            self._normalize()

    def _normalize(self):
        """Normalize the distribution according to its mode (log or linear)."""
        if not self._prob_dict:
            raise ValueError('A DictionaryProbDist must have at least one sample '
                             'before it can be normalized.')
        if self._log:
            self._normalize_log()
        else:
            self._normalize_linear()

    def _normalize_log(self):
        """Normalize when probabilities are stored as log values."""
        value_sum = sum_logs(list(self._prob_dict.values()))
        if value_sum <= _NINF:
            uniform_log = math.log(1.0 / len(self._prob_dict), 2)
            for k in self._prob_dict:
                self._prob_dict[k] = uniform_log
        else:
            for k, p in self._prob_dict.items():
                self._prob_dict[k] = p - value_sum

    def _normalize_linear(self):
        """Normalize when probabilities are stored as linear values."""
        total = sum(self._prob_dict.values())
        if total == 0:
            uniform = 1.0 / len(self._prob_dict)
            for k in self._prob_dict:
                self._prob_dict[k] = uniform
        else:
            factor = 1.0 / total
            for k, p in self._prob_dict.items():
                self._prob_dict[k] = p * factor

    def prob(self, sample):
        if self._log:
            return (2**(self._prob_dict[sample]) if sample in self._prob_dict else 0)
        else:
            return self._prob_dict.get(sample, 0)

    def logprob(self, sample):
        if self._log:
            return self._prob_dict.get(sample, _NINF)
        else:
            if sample not in self._prob_dict:
                return _NINF
            elif self._prob_dict[sample] == 0:
                return _NINF
            else:
                return math.log(self._prob_dict[sample], 2)

    def max(self):
        if not hasattr(self, '_max'):
            self._max = max((p, v) for (v, p) in self._prob_dict.items())[1]
        return self._max

    def samples(self):
        return self._prob_dict.keys()

    def __repr__(self):
        return '<ProbDist with %d samples>' % len(self._prob_dict)


@compat.python_2_unicode_compatible
class UniformProbDist(ProbDistI):
    """
    A probability distribution that assigns equal probability to each
    sample in a given set; and a zero probability to all other
    samples.
    """
    def __init__(self, samples):
        """
        Construct a new uniform probability distribution, that assigns
        equal probability to each sample in ``samples``.

        :param samples: The samples that should be given uniform
            probability.
        :type samples: list
        :raise ValueError: If ``samples`` is empty.
        """
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
    """
    Generates a random probability distribution whereby each sample
    will be between 0 and 1 with equal probability (uniform random distribution.
    Also called a continuous uniform distribution).
    """
    def __init__(self, samples):
        if len(samples) == 0:
            raise ValueError('A probability distribution must '+
                             'have at least one sample.')
        self._probs = self.unirand(samples)
        self._samples = list(self._probs.keys())

    @classmethod
    def unirand(cls, samples):
        """
        The key function that creates a randomized initial distribution
        that still sums to 1. Set as a dictionary of prob values so that
        it can still be passed to MutableProbDist and called with identical
        syntax to UniformProbDist
        """
        randrow = [random.random() for i in range(len(samples))]
        total = sum(randrow)
        for i, x in enumerate(randrow):
            randrow[i] = x/total

        total = sum(randrow)
        if total != 1:
            #this difference, if present, is so small (near NINF) that it
            #can be subtracted from any element without risking probs not (0 1)
            randrow[-1] -= total - 1

        return dict((s, randrow[i]) for i, s in enumerate(samples))

    def prob(self, sample):
        return self._probs.get(sample, 0)

    def samples(self):
        return self._samples

    def __repr__(self):
        return '<RandomUniformProbDist with %d samples>' %len(self._probs)


@compat.python_2_unicode_compatible
class MLEProbDist(ProbDistI):
    """
    The maximum likelihood estimate for the probability distribution
    of the experiment used to generate a frequency distribution.  The
    "maximum likelihood estimate" approximates the probability of each
    sample as the frequency of that sample in the frequency distribution.
    """
    def __init__(self, freqdist, bins=None):
        """
        Use the maximum likelihood estimate to create a probability
        distribution for the experiment used to generate ``freqdist``.

        :type freqdist: FreqDist
        :param freqdist: The frequency distribution that the
            probability estimates should be based on.
        """
        self._freqdist = freqdist

    def freqdist(self):
        """
        Return the frequency distribution that this probability
        distribution is based on.

        :rtype: FreqDist
        """
        return self._freqdist

    def prob(self, sample):
        return self._freqdist.freq(sample)

    def max(self):
        return self._freqdist.max()

    def samples(self):
        return self._freqdist.keys()

    def __repr__(self):
        """
        :rtype: str
        :return: A string representation of this ``ProbDist``.
        """
        return '<MLEProbDist based on %d samples>' % self._freqdist.N()


@compat.python_2_unicode_compatible
class LidstoneProbDist(ProbDistI):
    """
    The Lidstone estimate for the probability distribution of the
    experiment used to generate a frequency distribution.  The
    "Lidstone estimate" is parameterized by a real number *gamma*,
    which typically ranges from 0 to 1.  The Lidstone estimate
    approximates the probability of a sample with count *c* from an
    experiment with *N* outcomes and *B* bins as
    ``c+gamma)/(N+B*gamma)``.  This is equivalent to adding
    *gamma* to the count for each bin, and taking the maximum
    likelihood estimate of the resulting frequency distribution.
    """
    SUM_TO_ONE = False
    def __init__(self, freqdist, gamma, bins=None):
        """
        Use the Lidstone estimate to create a probability distribution
        for the experiment used to generate ``freqdist``.

        :type freqdist: FreqDist
        :param freqdist: The frequency distribution that the
            probability estimates should be based on.
        :type gamma: float
        :param gamma: A real number used to parameterize the
            estimate.  The Lidstone estimate is equivalent to adding
            *gamma* to the count for each bin, and taking the
            maximum likelihood estimate of the resulting frequency
            distribution.
        :type bins: int
        :param bins: The number of sample values that can be generated
            by the experiment that is described by the probability
            distribution.  This value must be correctly set for the
            probabilities of the sample values to sum to one.  If
            ``bins`` is not specified, it defaults to ``freqdist.B()``.
        """
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
            # In extreme cases we force the probability to be 0,
            # which it will be, since the count will be 0:
            self._gamma = 0
            self._divisor = 1

    def freqdist(self):
        """
        Return the frequency distribution that this probability
        distribution is based on.

        :rtype: FreqDist
        """
        return self._freqdist

    def prob(self, sample):
        c = self._freqdist[sample]
        return (c + self._gamma) / self._divisor

    def max(self):
        # For Lidstone distributions, probability is monotonic with
        # frequency, so the most probable sample is the one that
        # occurs most frequently.
        return self._freqdist.max()

    def samples(self):
        return self._freqdist.keys()

    def discount(self):
        gb = self._gamma * self._bins
        return gb / (self._N + gb)

    def __repr__(self):
        """
        Return a string representation of this ``ProbDist``.

        :rtype: str
        """
        return '<LidstoneProbDist based on %d samples>' % self._freqdist.N()


@compat.python_2_unicode_compatible
class LaplaceProbDist(LidstoneProbDist):
    """
    The Laplace estimate for the probability distribution of the
    experiment used to generate a frequency distribution.  The
    "Laplace estimate" approximates the probability of a sample with
    count *c* from an experiment with *N* outcomes and *B* bins as
    *(c+1)/(N+B)*.  This is equivalent to adding one to the count for
    each bin, and taking the maximum likelihood estimate of the
    resulting frequency distribution.
    """
    def __init__(self, freqdist, bins=None):
        """
        Use the Laplace estimate to create a probability distribution
        for the experiment used to generate ``freqdist``.

        :type freqdist: FreqDist
        :param freqdist: The frequency distribution that the
            probability estimates should be based on.
        :type bins: int
        :param bins: The number of sample values that can be generated
            by the experiment that is described by the probability
            distribution.  If ``bins`` is not specified, it defaults to ``freqdist.B()``.
        """
        LidstoneProbDist.__init__(self, freqdist, 1, bins)

    def __repr__(self):
        """
        :rtype: str
        :return: A string representation of this ``ProbDist``.
        """
        return '<LaplaceProbDist based on %d samples>' % self._freqdist.N()


@compat.python_2_unicode_compatible
class ELEProbDist(LidstoneProbDist):
    """
    The expected likelihood estimate for the probability distribution
    of the experiment used to generate a frequency distribution.  The
    "expected likelihood estimate" approximates the probability of a
    sample with count *c* from an experiment with *N* outcomes and
    *B* bins as *(c+0.5)/(N+B/2)*.  This is equivalent to adding 0.5
    to the count for each bin, and taking the maximum likelihood
    estimate of the resulting frequency distribution.
    """
    def __init__(self, freqdist, bins=None):
        """
        Use the expected likelihood estimate to create a probability
        distribution for the experiment used to generate ``freqdist``.

        :type freqdist: FreqDist
        :param freqdist: The frequency distribution that the
            probability estimates should be based on.
        :type bins: int
        :param bins: The number of sample values that can be generated
            by the experiment that is described by the probability
            distribution.  If ``bins`` is not specified, it defaults to ``freqdist.B()``.
        """
        LidstoneProbDist.__init__(self, freqdist, 0.5, bins)

    def __repr__(self):
        """
        Return a string representation of this ``ProbDist``.

        :rtype: string
        """
        return '<ELEProbDist based on %d samples>' % self._freqdist.N()


@compat.python_2_unicode_compatible
class HeldoutProbDist(ProbDistI):
    """
    The heldout estimate for the probability distribution of the
    experiment used to generate two frequency distributions.  These
    two frequency distributions are called the "heldout frequency
    distribution" and the "base frequency distribution."  The
    "heldout estimate" uses uses the "heldout frequency
    distribution" to predict the probability of each sample, given its
    frequency in the "base frequency distribution".

    In particular, the heldout estimate approximates the probability
    for a sample that occurs *r* times in the base distribution as
    the average frequency in the heldout distribution of all samples
    that occur *r* times in the base distribution.

    This average frequency is *Tr[r]/(Nr[r].N)*, where:

    - *Tr[r]* is the total count in the heldout distribution for
      all samples that occur *r* times in the base distribution.
    - *Nr[r]* is the number of samples that occur *r* times in
      the base distribution.
    - *N* is the number of outcomes recorded by the heldout
      frequency distribution.

    In order to increase the efficiency of the ``prob`` member
    function, *Tr[r]/(Nr[r].N)* is precomputed for each value of *r*
    when the ``HeldoutProbDist`` is created.

    :type _estimate: list(float)
    :ivar _estimate: A list mapping from *r*, the number of
        times that a sample occurs in the base distribution, to the
        probability estimate for that sample.  ``_estimate[r]`` is
        calculated by finding the average frequency in the heldout
        distribution of all samples that occur *r* times in the base
        distribution.  In particular, ``_estimate[r]`` =
        *Tr[r]/(Nr[r].N)*.
    :type _max_r: int
    :ivar _max_r: The maximum number of times that any sample occurs
        in the base distribution.  ``_max_r`` is used to decide how
        large ``_estimate`` must be.
    """
    SUM_TO_ONE = False
    def __init__(self, base_fdist, heldout_fdist, bins=None):
        """
        Use the heldout estimate to create a probability distribution
        for the experiment used to generate ``base_fdist`` and
        ``heldout_fdist``.

        :type base_fdist: FreqDist
        :param base_fdist: The base frequency distribution.
        :type heldout_fdist: FreqDist
        :param heldout_fdist: The heldout frequency distribution.
        :type bins: int
        :param bins: The number of sample values that can be generated
            by the experiment that is described by the probability
            distribution.  This must be correctly set for the
            probabilities of the sample values to sum to one.  If
            ``bins`` is not specified, it defaults to ``freqdist.B()``.
        """

        self._base_fdist = base_fdist
        self._heldout_fdist = heldout_fdist

        # The max number of times any sample occurs in base_fdist.
        self._max_r = base_fdist[base_fdist.max()]

        # Calculate Tr, Nr, and N.
        Tr = self._calculate_Tr()
        r_Nr = base_fdist.r_Nr(bins)
        Nr = [r_Nr[r] for r in range(self._max_r+1)]
        N = heldout_fdist.N()

        # Use Tr, Nr, and N to compute the probability estimate for
        # each value of r.
        self._estimate = self._calculate_estimate(Tr, Nr, N)

    def _calculate_Tr(self):
        """
        Return the list *Tr*, where *Tr[r]* is the total count in
        ``heldout_fdist`` for all samples that occur *r*
        times in ``base_fdist``.

        :rtype: list(float)
        """
        Tr = [0.0] * (self._max_r+1)
        for sample in self._heldout_fdist:
            r = self._base_fdist[sample]
            Tr[r] += self._heldout_fdist[sample]
        return Tr

    def _calculate_estimate(self, Tr, Nr, N):
        """
        Return the list *estimate*, where *estimate[r]* is the probability
        estimate for any sample that occurs *r* times in the base frequency
        distribution.  In particular, *estimate[r]* is *Tr[r]/(N[r].N)*.
        In the special case that *N[r]=0*, *estimate[r]* will never be used;
        so we define *estimate[r]=None* for those cases.

        :rtype: list(float)
        :type Tr: list(float)
        :param Tr: the list *Tr*, where *Tr[r]* is the total count in
            the heldout distribution for all samples that occur *r*
            times in base distribution.
        :type Nr: list(float)
        :param Nr: The list *Nr*, where *Nr[r]* is the number of
            samples that occur *r* times in the base distribution.
        :type N: int
        :param N: The total number of outcomes recorded by the heldout
            frequency distribution.
        """
        estimate = []
        for r in range(self._max_r+1):
            if Nr[r] == 0: estimate.append(None)
            else: estimate.append(Tr[r]/(Nr[r]*N))
        return estimate

    def base_fdist(self):
        """
        Return the base frequency distribution that this probability
        distribution is based on.

        :rtype: FreqDist
        """
        return self._base_fdist

    def heldout_fdist(self):
        """
        Return the heldout frequency distribution that this
        probability distribution is based on.

        :rtype: FreqDist
        """
        return self._heldout_fdist

    def samples(self):
        return self._base_fdist.keys()

    def prob(self, sample):
        # Use our precomputed probability estimate.
        r = self._base_fdist[sample]
        return self._estimate[r]

    def max(self):
        # Note: the Heldout estimation is *not* necessarily monotonic;
        # so this implementation is currently broken.  However, it
        # should give the right answer *most* of the time. :)
        return self._base_fdist.max()

    def discount(self):
        raise NotImplementedError()

    def __repr__(self):
        """
        :rtype: string
        :return: A string representation of this ``ProbDist``.
        """
        s = '<HeldoutProbDist: %d base samples; %d heldout samples>'
        return s % (self._base_fdist.N(), self._heldout_fdist.N())


@compat.python_2_unicode_compatible
class CrossValidationProbDist(ProbDistI):
    """
    The cross-validation estimate for the probability distribution of
    the experiment used to generate a set of frequency distribution.
    The "cross-validation estimate" for the probability of a sample
    is found by averaging the held-out estimates for the sample in
    each pair of frequency distributions.
    """
    SUM_TO_ONE = False
    def __init__(self, freqdists, bins):
        """
        Use the cross-validation estimate to create a probability
        distribution for the experiment used to generate
        ``freqdists``.

        :type freqdists: list(FreqDist)
        :param freqdists: A list of the frequency distributions
            generated by the experiment.
        :type bins: int
        :param bins: The number of sample values that can be generated
            by the experiment that is described by the probability
            distribution.  This must be correctly set for the
            probabilities of the sample values to sum to one.  If
            ``bins`` is not specified, it defaults to ``freqdist.B()``.
        """
        self._freqdists = freqdists

        # Create a heldout probability distribution for each pair of
        # frequency distributions in freqdists.
        self._heldout_probdists = []
        for fdist1 in freqdists:
            for fdist2 in freqdists:
                if fdist1 is not fdist2:
                    probdist = HeldoutProbDist(fdist1, fdist2, bins)
                    self._heldout_probdists.append(probdist)

    def freqdists(self):
        """
        Return the list of frequency distributions that this ``ProbDist`` is based on.

        :rtype: list(FreqDist)
        """
        return self._freqdists

    def samples(self):
        # [xx] nb: this is not too efficient
        return set(sum([list(fd) for fd in self._freqdists], []))

    def prob(self, sample):
        # Find the average probability estimate returned by each
        # heldout distribution.
        prob = 0.0
        for heldout_probdist in self._heldout_probdists:
            prob += heldout_probdist.prob(sample)
        return prob/len(self._heldout_probdists)

    def discount(self):
        raise NotImplementedError()

    def __repr__(self):
        """
        Return a string representation of this ``ProbDist``.

        :rtype: string
        """
        return '<CrossValidationProbDist: %d-way>' % len(self._freqdists)


@compat.python_2_unicode_compatible
class KneserNeyProbDist(ProbDistI):
    """
    Kneser-Ney estimate of a probability distribution. This is a version of
    back-off that counts how likely an n-gram is provided the n-1-gram had
    been seen in training. Extends the ProbDistI interface, requires a trigram
    FreqDist instance to train on. Optionally, a different from default discount
    value can be specified. The default discount is set to 0.75.

    """
    def __init__(self, freqdist, bins=None, discount=0.75):
        """
        :param freqdist: The trigram frequency distribution upon which to base
            the estimation
        :type freqdist: FreqDist
        :param bins: Included for compatibility with nltk.tag.hmm
        :type bins: int or float
        :param discount: The discount applied when retrieving counts of
            trigrams
        :type discount: float (preferred, but can be set to int)
        """

        if not bins:
            self._bins = freqdist.B()
        else:
            self._bins = bins
        self._D = discount

        # cache for probability calculation
        self._cache = {}

        # internal bigram and trigram frequency distributions
        self._bigrams = defaultdict(int)
        self._trigrams = freqdist

        # helper dictionaries used to calculate probabilities
        self._wordtypes_after = defaultdict(float)
        self._trigrams_contain = defaultdict(float)
        self._wordtypes_before = defaultdict(float)
        for w0, w1, w2 in freqdist:
            self._bigrams[(w0,w1)] += freqdist[(w0, w1, w2)]
            self._wordtypes_after[(w0,w1)] += 1
            self._trigrams_contain[w1] += 1
            self._wordtypes_before[(w1,w2)] += 1

    def prob(self, trigram):
        # sample must be a triple
        if len(trigram) != 3:
            raise ValueError('Expected an iterable with 3 members.')
        trigram = tuple(trigram)
        w0, w1, w2 = trigram

        if trigram in self._cache:
            return self._cache[trigram]
        else:
            # if the sample trigram was seen during training
            if trigram in self._trigrams:
                prob = (self._trigrams[trigram]
                        - self.discount())/self._bigrams[(w0, w1)]

            # else if the 'rougher' environment was seen during training
            elif (w0,w1) in self._bigrams and (w1,w2) in self._wordtypes_before:
                aftr = self._wordtypes_after[(w0, w1)]
                bfr = self._wordtypes_before[(w1, w2)]

                # the probability left over from alphas
                leftover_prob = ((aftr * self.discount())
                                 / self._bigrams[(w0, w1)])

                # the beta (including normalization)
                beta = bfr /(self._trigrams_contain[w1] - aftr)

                prob = leftover_prob * beta

            # else the sample was completely unseen during training
            else:
                prob = 0.0

            self._cache[trigram] = prob
            return prob

    def discount(self):
        """
        Return the value by which counts are discounted. By default set to 0.75.

        :rtype: float
        """
        return self._D

    def set_discount(self, discount):
        """
        Set the value by which counts are discounted to the value of discount.

        :param discount: the new value to discount counts by
        :type discount: float (preferred, but int possible)
        :rtype: None
        """
        self._D = discount

    def samples(self):
        return self._trigrams.keys()

    def max(self):
        return self._trigrams.max()

    def __repr__(self):
        '''
        Return a string representation of this ProbDist

        :rtype: string
        '''
        return '<KneserNeyProbDist based on {0} trigrams'.format(self._trigrams.N())

##//////////////////////////////////////////////////////
##  Probability Distribution Operations
##//////////////////////////////////////////////////////

def log_likelihood(test_pdist, actual_pdist):
    if (not isinstance(test_pdist, ProbDistI) or
        not isinstance(actual_pdist, ProbDistI)):
        raise ValueError('expected a ProbDist.')
    # Is this right?
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
    """
    A collection of frequency distributions for a single experiment
    run under different conditions.  Conditional frequency
    distributions are used to record the number of times each sample
    occurred, given the condition under which the experiment was run.
    For example, a conditional frequency distribution could be used to
    record the frequency of each word (type) in a document, given its
    length.  Formally, a conditional frequency distribution can be
    defined as a function that maps from each condition to the
    FreqDist for the experiment under that condition.

    Conditional frequency distributions are typically constructed by
    repeatedly running an experiment under a variety of conditions,
    and incrementing the sample outcome counts for the appropriate
    conditions.  For example, the following code will produce a
    conditional frequency distribution that encodes how often each
    word type occurs, given the length of the word type:

        >>> from nltk.probability import ConditionalFreqDist
        >>> from nltk.tokenize import word_tokenize
        >>> sent = "the the the dog dog some other words that we do not care about"
        >>> cfdist = ConditionalFreqDist()
        >>> for word in word_tokenize(sent):
        ...     condition = len(word)
        ...     cfdist[condition][word] += 1

    An equivalent way to do this is with the initializer:

        >>> cfdist = ConditionalFreqDist((len(word), word) for word in word_tokenize(sent))

    The frequency distribution for each condition is accessed using
    the indexing operator:

        >>> cfdist[3]
        FreqDist({'the': 3, 'dog': 2, 'not': 1})
        >>> cfdist[3].freq('the')
        0.5
        >>> cfdist[3]['dog']
        2

    When the indexing operator is used to access the frequency
    distribution for a condition that has not been accessed before,
    ``ConditionalFreqDist`` creates a new empty FreqDist for that
    condition.

    """
    def __init__(self, cond_samples=None):
        """
        Construct a new empty conditional frequency distribution.  In
        particular, the count for every sample, under every condition,
        is zero.

        :param cond_samples: The samples to initialize the conditional
            frequency distribution with
        :type cond_samples: Sequence of (condition, sample) tuples
        """
        defaultdict.__init__(self, FreqDist)
        if cond_samples:
            for (cond, sample) in cond_samples:
                self[cond][sample] += 1

    def __reduce__(self):
        kv_pairs = ((cond, self[cond]) for cond in self.conditions())
        return (self.__class__, (), None, None, kv_pairs)

    def conditions(self):
        """
        Return a list of the conditions that have been accessed for
        this ``ConditionalFreqDist``.  Use the indexing operator to
        access the frequency distribution for a given condition.
        Note that the frequency distributions for some conditions
        may contain zero sample outcomes.

        :rtype: list
        """
        return list(self.keys())

    def N(self):
        """
        Return the total number of sample outcomes that have been
        recorded by this ``ConditionalFreqDist``.

        :rtype: int
        """
        return sum(fdist.N() for fdist in compat.itervalues(self))

    def plot(self, *args, **kwargs):
        """
        Plot the given samples from the conditional frequency distribution.
        For a cumulative plot, specify cumulative=True.
        (Requires Matplotlib to be installed.)

        :param samples: The samples to plot
        :type samples: list
        :param title: The title for the graph
        :type title: str
        :param conditions: The conditions to plot (default is all)
        :type conditions: list
        """
        try:
            from matplotlib import pylab
        except ImportError:
            raise ValueError('The plot function requires matplotlib to be installed.'
                         'See http://matplotlib.org/')

        cumulative = _get_kwarg(kwargs, 'cumulative', False)
        conditions = _get_kwarg(kwargs, 'conditions', sorted(self.conditions()))
        title = _get_kwarg(kwargs, 'title', '')
        samples = _get_kwarg(kwargs, 'samples',
                             sorted(set(v for c in conditions for v in self[c])))  # this computation could be wasted
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
            # percents = [f * 100 for f in freqs] only in ConditionalProbDist?
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
        """
        Tabulate the given samples from the conditional frequency distribution.

        :param samples: The samples to plot
        :type samples: list
        :param conditions: The conditions to plot (default is all)
        :type conditions: list
        :param cumulative: A flag to specify whether the freqs are cumulative (default = False)
        :type title: bool
        """

        cumulative = _get_kwarg(kwargs, 'cumulative', False)
        conditions = _get_kwarg(kwargs, 'conditions', sorted(self.conditions()))
        samples = _get_kwarg(kwargs, 'samples',
                             sorted(set(v for c in conditions for v in self[c])))  # this computation could be wasted

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

    # Mathematical operators
    
    def __add__(self, other):
        """
        Add counts from two ConditionalFreqDists.
        """
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
        """
        Subtract count, but keep only results with positive counts.
        """
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
        """
        Union is the maximum of value in either of the input counters.
        """
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
        """ 
        Intersection is the minimum of corresponding counts.
        """
        if not isinstance(other, ConditionalFreqDist):
            return NotImplemented
        result = ConditionalFreqDist()
        for cond in self.conditions():
            newfreqdist = self[cond] & other[cond]
            if newfreqdist:
                result[cond] = newfreqdist
        return result

    # @total_ordering doesn't work here, since the class inherits from a builtin class
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
        """
        Return a string representation of this ``ConditionalFreqDist``.

        :rtype: str
        """
        return '<ConditionalFreqDist with %d conditions>' % len(self)


@compat.python_2_unicode_compatible
class ConditionalProbDistI(dict):
    """
    A collection of probability distributions for a single experiment
    run under different conditions.  Conditional probability
    distributions are used to estimate the likelihood of each sample,
    given the condition under which the experiment was run.  For
    example, a conditional probability distribution could be used to
    estimate the probability of each word type in a document, given
    the length of the word type.  Formally, a conditional probability
    distribution can be defined as a function that maps from each
    condition to the ``ProbDist`` for the experiment under that
    condition.
    """
    def __init__(self):
        raise NotImplementedError("Interfaces can't be instantiated")

    def conditions(self):
        """
        Return a list of the conditions that are represented by
        this ``ConditionalProbDist``.  Use the indexing operator to
        access the probability distribution for a given condition.

        :rtype: list
        """
        return list(self.keys())

    def __repr__(self):
        """
        Return a string representation of this ``ConditionalProbDist``.

        :rtype: string
        """
        return '<%s with %d conditions>' % (type(self).__name__, len(self))


class ConditionalProbDist(ConditionalProbDistI):
    """
    A conditional probability distribution modeling the experiments
    that were used to generate a conditional frequency distribution.
    A ConditionalProbDist is constructed from a
    ``ConditionalFreqDist`` and a ``ProbDist`` factory:

    - The ``ConditionalFreqDist`` specifies the frequency
      distribution for each condition.
    - The ``ProbDist`` factory is a function that takes a
      condition's frequency distribution, and returns its
      probability distribution.  A ``ProbDist`` class's name (such as
      ``MLEProbDist`` or ``HeldoutProbDist``) can be used to specify
      that class's constructor.

    The first argument to the ``ProbDist`` factory is the frequency
    distribution that it should model; and the remaining arguments are
    specified by the ``factory_args`` parameter to the
    ``ConditionalProbDist`` constructor.  For example, the following
    code constructs a ``ConditionalProbDist``, where the probability
    distribution for each condition is an ``ELEProbDist`` with 10 bins:

        >>> from nltk.corpus import brown
        >>> from nltk.probability import ConditionalFreqDist
        >>> from nltk.probability import ConditionalProbDist, ELEProbDist
        >>> cfdist = ConditionalFreqDist(brown.tagged_words()[:5000])
        >>> cpdist = ConditionalProbDist(cfdist, ELEProbDist, 10)
        >>> cpdist['passed'].max()
        'VBD'
        >>> cpdist['passed'].prob('VBD')
        0.423...

    """
    def __init__(self, cfdist, probdist_factory,
                 *factory_args, **factory_kw_args):
        """
        Construct a new conditional probability distribution, based on
        the given conditional frequency distribution and ``ProbDist``
        factory.

        :type cfdist: ConditionalFreqDist
        :param cfdist: The ``ConditionalFreqDist`` specifying the
            frequency distribution for each condition.
        :type probdist_factory: class or function
        :param probdist_factory: The function or class that maps
            a condition's frequency distribution to its probability
            distribution.  The function is called with the frequency
            distribution as its first argument,
            ``factory_args`` as its remaining arguments, and
            ``factory_kw_args`` as keyword arguments.
        :type factory_args: (any)
        :param factory_args: Extra arguments for ``probdist_factory``.
            These arguments are usually used to specify extra
            properties for the probability distributions of individual
            conditions, such as the number of bins they contain.
        :type factory_kw_args: (any)
        :param factory_kw_args: Extra keyword arguments for ``probdist_factory``.
        """
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
    """
    An alternative ConditionalProbDist that simply wraps a dictionary of
    ProbDists rather than creating these from FreqDists.
    """

    def __init__(self, probdist_dict):
        """
        :param probdist_dict: a dictionary containing the probdists indexed
            by the conditions
        :type probdist_dict: dict any -> probdist
        """
        self.update(probdist_dict)

    def __missing__(self, key):
        self[key] = DictionaryProbDist()
        return self[key]

##//////////////////////////////////////////////////////
## Adding in log-space.
##//////////////////////////////////////////////////////

# If the difference is bigger than this, then just take the bigger one:
_ADD_LOGS_MAX_DIFF = math.log(1e-30, 2)

def add_logs(logx, logy):
    """
    Given two numbers ``logx`` = *log(x)* and ``logy`` = *log(y)*, return
    *log(x+y)*.  Conceptually, this is the same as returning
    ``log(2**(logx)+2**(logy))``, but the actual implementation
    avoids overflow errors that could result from direct computation.
    """
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
    """
    A mix-in class to associate probabilities with other classes
    (trees, rules, etc.).  To use the ``ProbabilisticMixIn`` class,
    define a new class that derives from an existing class and from
    ProbabilisticMixIn.  You will need to define a new constructor for
    the new class, which explicitly calls the constructors of both its
    parent classes.  For example:

        >>> from nltk.probability import ProbabilisticMixIn
        >>> class A:
        ...     def __init__(self, x, y): self.data = (x,y)
        ...
        >>> class ProbabilisticA(A, ProbabilisticMixIn):
        ...     def __init__(self, x, y, **prob_kwarg):
        ...         A.__init__(self, x, y)
        ...         ProbabilisticMixIn.__init__(self, **prob_kwarg)

    See the documentation for the ProbabilisticMixIn
    ``constructor<__init__>`` for information about the arguments it
    expects.

    You should generally also redefine the string representation
    methods, the comparison methods, and the hashing method.
    """
    def __init__(self, **kwargs):
        """
        Initialize this object's probability.  This initializer should
        be called by subclass constructors.  ``prob`` should generally be
        the first argument for those constructors.

        :param prob: The probability associated with the object.
        :type prob: float
        :param logprob: The log of the probability associated with
            the object.
        :type logprob: float
        """
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
        """
        Set the probability associated with this object to ``prob``.

        :param prob: The new probability
        :type prob: float
        """
        self.__prob = prob
        self.__logprob = None

    def set_logprob(self, logprob):
        """
        Set the log probability associated with this object to
        ``logprob``.  I.e., set the probability associated with this
        object to ``2**(logprob)``.

        :param logprob: The new log probability
        :type logprob: float
        """
        self.__logprob = logprob
        self.__prob = None

    def prob(self):
        """
        Return the probability associated with this object.

        :rtype: float
        """
        if self.__prob is None:
            if self.__logprob is None: return None
            self.__prob = 2**(self.__logprob)
        return self.__prob

    def logprob(self):
        """
        Return ``log(p)``, where ``p`` is the probability associated
        with this object.

        :rtype: float
        """
        if self.__logprob is None:
            if self.__prob is None: return None
            self.__logprob = math.log(self.__prob, 2)
        return self.__logprob

class ImmutableProbabilisticMixIn(ProbabilisticMixIn):
    def set_prob(self, prob):
        raise ValueError('%s is immutable' % self.__class__.__name__)
    def set_logprob(self, prob):
        raise ValueError('%s is immutable' % self.__class__.__name__)

## Helper function for processing keyword arguments

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
    """
    Create a new frequency distribution, with random samples.  The
    samples are numbers from 1 to ``numsamples``, and are generated by
    summing two numbers, each of which has a uniform distribution.
    """
    import random
    fdist = FreqDist()
    for x in range(numoutcomes):
        y = (random.randint(1, (1 + numsamples) // 2) +
             random.randint(0, numsamples // 2))
        fdist[y] += 1
    return fdist

def _create_sum_pdist(numsamples):
    """
    Return the true probability distribution for the experiment
    ``_create_rand_fdist(numsamples, x)``.
    """
    fdist = FreqDist()
    for x in range(1, (1 + numsamples) // 2 + 1):
        for y in range(0, numsamples // 2 + 1):
            fdist[x+y] += 1
    return MLEProbDist(fdist)

def demo(numsamples=6, numoutcomes=500):
    """
    A demonstration of frequency distributions and probability
    distributions.  This demonstration creates three frequency
    distributions with, and uses them to sample a random process with
    ``numsamples`` samples.  Each frequency distribution is sampled
    ``numoutcomes`` times.  These three frequency distributions are
    then used to build six probability distributions.  Finally, the
    probability estimates of these distributions are compared to the
    actual probability of each sample.

    :type numsamples: int
    :param numsamples: The number of samples to use in each demo
        frequency distributions.
    :type numoutcomes: int
    :param numoutcomes: The total number of outcomes for each
        demo frequency distribution.  These outcomes are divided into
        ``numsamples`` bins.
    :rtype: None
    """

    # Randomly sample a stochastic process three times.
    fdist1 = _create_rand_fdist(numsamples, numoutcomes)
    fdist2 = _create_rand_fdist(numsamples, numoutcomes)
    fdist3 = _create_rand_fdist(numsamples, numoutcomes)

    # Use our samples to create probability distributions.
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

    # Find the probability of each sample.
    vals = []
    for n in range(1,numsamples+1):
        vals.append(tuple([n, fdist1.freq(n)] +
                          [pdist.prob(n) for pdist in pdists]))

    # Print the results in a formatted table.
    print(('%d samples (1-%d); %d outcomes were sampled for each FreqDist' %
           (numsamples, numsamples, numoutcomes)))
    print('='*9*(len(pdists)+2))
    FORMATSTR = '      FreqDist '+ '%8s '*(len(pdists)-1) + '|  Actual'
    print(FORMATSTR % tuple(repr(pdist)[1:9] for pdist in pdists[:-1]))
    print('-'*9*(len(pdists)+2))
    FORMATSTR = '%3d   %8.6f ' + '%8.6f '*(len(pdists)-1) + '| %8.6f'
    for val in vals:
        print(FORMATSTR % val)

    # Print the totals for each column (should all be 1.0)
    zvals = list(zip(*vals))
    sums = [sum(val) for val in zvals[1:]]
    print('-'*9*(len(pdists)+2))
    FORMATSTR = 'Total ' + '%8.6f '*(len(pdists)) + '| %8.6f'
    print(FORMATSTR % tuple(sums))
    print('='*9*(len(pdists)+2))

    # Display the distributions themselves, if they're short enough.
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