/* global window */
import React, {PureComponent} from 'react';
import PropTypes from 'prop-types';

import {getXVIZConfig} from '@xviz/parser';
import DualPlaybackControl from './dual-playback-control';

import connectToLog from '../connect';

const TIME_SCALES = {
  seconds: 0.001,
  milliseconds: 1
};

class PlaybackControl extends PureComponent {
  static propTypes = {
    // from log
    timestamp: PropTypes.number,
    lookAhead: PropTypes.number,
    startTime: PropTypes.number,
    endTime: PropTypes.number,
    bufferRange: PropTypes.array,

    // state override
    isPlaying: PropTypes.bool,

    // config
    width: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    style: PropTypes.object,
    compact: PropTypes.bool,
    className: PropTypes.string,
    step: PropTypes.number,
    padding: PropTypes.oneOfType([PropTypes.number, PropTypes.object]),
    tickSpacing: PropTypes.number,
    markers: PropTypes.arrayOf(PropTypes.object),
    formatTick: PropTypes.func,
    formatTimestamp: PropTypes.func,
    // dual playback control config
    maxLookAhead: PropTypes.number,
    formatLookAhead: PropTypes.func,

    // callbacks
    onPlay: PropTypes.func,
    onPause: PropTypes.func,
    onSeek: PropTypes.func,
    onLookAheadChange: PropTypes.func
  };

  static defaultProps = DualPlaybackControl.defaultProps;

  state = {
    isPlaying: false,
    timeScale: TIME_SCALES[getXVIZConfig().TIMESTAMP_FORMAT] || 1
  };

  componentWillReceiveProps(nextProps) {
    if ('isPlaying' in nextProps) {
      this.setState({isPlaying: Boolean(nextProps.isPlaying)});
    }
  }

  componentDidUpdate(prevProps, prevState) {
    const {isPlaying} = this.state;
    if (isPlaying && prevState.isPlaying !== isPlaying) {
      this._lastAnimationUpdate = Date.now();
      this._animationFrame = window.requestAnimationFrame(this._animate);
    }
  }

  componentWillUnmount() {
    if (this._animationFrame) {
      window.cancelAnimationFrame(this._animationFrame);
    }
  }

  _animationFrame = null;
  _lastAnimationUpdate = -1;

  _onPlay = () => {
    this.props.onPlay();
    this.setState({isPlaying: true});
  };

  _onPause = () => {
    this.props.onPause();
    this.setState({isPlaying: false});
  };

  _onSeek = timestamp => {
    this._onTimeChange(timestamp);

    if (this.state.isPlaying) {
      this._onPause();
    }
  };

  _onTimeChange = timestamp => {
    const {log, onSeek} = this.props;
    if (!onSeek(timestamp) && log) {
      log.seek(timestamp);
    }
  };

  _onLookAheadChange = lookAhead => {
    const {log, onLookAheadChange} = this.props;
    if (!onLookAheadChange(lookAhead) && log) {
      log.setLookAhead(lookAhead);
    }
  };

  _animate = () => {
    if (this.state.isPlaying) {
      const now = Date.now();
      const {startTime, endTime, bufferRange, timestamp} = this.props;
      const {timeScale} = this.state;
      const lastUpdate = this._lastAnimationUpdate;
      const {PLAYBACK_FRAME_RATE, TIME_WINDOW} = getXVIZConfig();

      // avoid skipping frames - cap delta at resolution
      let timeDeltaMs = lastUpdate > 0 ? now - lastUpdate : 0;
      timeDeltaMs = Math.min(timeDeltaMs, 1000 / PLAYBACK_FRAME_RATE);

      let newTimestamp = timestamp + timeDeltaMs * timeScale;
      if (newTimestamp > endTime) {
        newTimestamp = startTime;
      }

      // check buffer availability
      if (bufferRange.some(r => newTimestamp >= r[0] && newTimestamp <= r[1] + TIME_WINDOW)) {
        // only move forward if buffer is loaded
        // otherwise pause and wait
        this._onTimeChange(newTimestamp);
      }

      this._lastAnimationUpdate = now;
      this._animationFrame = window.requestAnimationFrame(this._animate);
    }
  };

  _formatTime = (x, formatter = null) => {
    const {startTime} = this.props;
    const {timeScale} = this.state;

    if (formatter) {
      return formatter(x, startTime);
    }

    const deltaTimeS = (x - startTime) / timeScale / 1000;
    return DualPlaybackControl.formatTimeCode(deltaTimeS, '{mm}:{ss}');
  };

  _formatTick = x => {
    return this._formatTime(x, this.props.formatTick);
  };

  _formatTimestamp = x => {
    return this._formatTime(x, this.props.formatTimestamp);
  };

  _formatLookAhead = x => {
    const {formatLookAhead} = this.props;
    const {timeScale} = this.state;

    if (formatLookAhead) {
      return formatLookAhead(x);
    }

    const deltaTimeS = x / timeScale / 1000;
    return DualPlaybackControl.formatTimeCode(deltaTimeS, '{s}.{S}s');
  };

  render() {
    const {startTime, endTime, timestamp, lookAhead, bufferRange, ...otherProps} = this.props;

    if (!Number.isFinite(timestamp) || !Number.isFinite(startTime)) {
      return null;
    }

    const buffers = bufferRange.map(r => ({
      startTime: Math.max(r[0], startTime),
      endTime: Math.min(r[1], endTime)
    }));

    return (
      <DualPlaybackControl
        {...otherProps}
        bufferRange={buffers}
        currentTime={timestamp}
        lookAhead={lookAhead}
        startTime={startTime}
        endTime={endTime}
        isPlaying={this.state.isPlaying}
        formatTick={this._formatTick}
        formatTimestamp={this._formatTimestamp}
        formatLookAhead={this._formatLookAhead}
        onSeek={this._onSeek}
        onPlay={this._onPlay}
        onPause={this._onPause}
        onLookAheadChange={this._onLookAheadChange}
      />
    );
  }
}

const getLogState = log => ({
  timestamp: log.getCurrentTime(),
  lookAhead: log.getLookAhead(),
  startTime: log.getLogStartTime(),
  endTime: log.getLogEndTime(),
  bufferRange: log.getBufferRange()
});

export default connectToLog({getLogState, Component: PlaybackControl});
