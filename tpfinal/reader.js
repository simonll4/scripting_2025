class MediaMTXWebRTCReader {
  /**
   * Create a MediaMTXWebRTCReader.
   * @param {Conf} conf - configuration.
   */
  constructor(conf) {
    this.retryPause = 2000;
    this.conf = conf;
    this.state = 'getting_codecs';
    this.restartTimeout = null;
    this.pc = null;
    this.offerData = null;
    this.sessionUrl = null;
    this.queuedCandidates = [];
    this.#getNonAdvertisedCodecs();
  }

  /**
   * Close the reader and all its resources.
   */
  close() {
    this.state = 'closed';

    if (this.pc !== null) {
      this.pc.close();
    }

    if (this.restartTimeout !== null) {
      clearTimeout(this.restartTimeout);
    }
  }

  static #supportsNonAdvertisedCodec(codec, fmtp) {
    return new Promise((resolve) => {
      const pc = new RTCPeerConnection({ iceServers: [] });
      const mediaType = 'audio';
      let payloadType = '';

      pc.addTransceiver(mediaType, { direction: 'recvonly' });
      pc.createOffer()
        .then((offer) => {
          if (offer.sdp === undefined) {
            throw new Error('SDP not present');
          }
          if (offer.sdp.includes(` ${codec}`)) { // codec is advertised, there's no need to add it manually
            throw new Error('already present');
          }

          const sections = offer.sdp.split(`m=${mediaType}`);

          const payloadTypes = sections.slice(1)
            .map((s) => s.split('\r\n')[0].split(' ').slice(3))
            .reduce((prev, cur) => [...prev, ...cur], []);
          payloadType = this.#reservePayloadType(payloadTypes);

          const lines = sections[1].split('\r\n');
          lines[0] += ` ${payloadType}`;
          lines.splice(lines.length - 1, 0, `a=rtpmap:${payloadType} ${codec}`);
          if (fmtp !== undefined) {
            lines.splice(lines.length - 1, 0, `a=fmtp:${payloadType} ${fmtp}`);
          }
          sections[1] = lines.join('\r\n');
          offer.sdp = sections.join(`m=${mediaType}`);
          return pc.setLocalDescription(offer);
        })
        .then(() => (
          pc.setRemoteDescription(new RTCSessionDescription({
            type: 'answer',
            sdp: 'v=0\r\n'
            + 'o=- 6539324223450680508 0 IN IP4 0.0.0.0\r\n'
            + 's=-\r\n'
            + 't=0 0\r\n'
            + 'a=fingerprint:sha-256 0D:9F:78:15:42:B5:4B:E6:E2:94:3E:5B:37:78:E1:4B:54:59:A3:36:3A:E5:05:EB:27:EE:8F:D2:2D:41:29:25\r\n'
            + `m=${mediaType} 9 UDP/TLS/RTP/SAVPF ${payloadType}\r\n`
            + 'c=IN IP4 0.0.0.0\r\n'
            + 'a=ice-pwd:7c3bf4770007e7432ee4ea4d697db675\r\n'
            + 'a=ice-ufrag:29e036dc\r\n'
            + 'a=sendonly\r\n'
            + 'a=rtcp-mux\r\n'
            + `a=rtpmap:${payloadType} ${codec}\r\n`
            + ((fmtp !== undefined) ? `a=fmtp:${payloadType} ${fmtp}\r\n` : ''),
          }))
        ))
        .then(() => {
          resolve(true);
        })
        .catch(() => {
          resolve(false);
        })
        .finally(() => {
          pc.close();
        });
    });
  }

  static #unquoteCredential(v) {
    return JSON.parse(`"${v}"`);
  }

  static #linkToIceServers(links) {
    return (links !== null) ? links.split(', ').map((link) => {
      const m = link.match(/^<(.+?)>; rel="ice-server"(; username="(.*?)"; credential="(.*?)"; credential-type="password")?/i);
      const ret = {
        urls: [m[1]],
      };

      if (m[3] !== undefined) {
        ret.username = this.#unquoteCredential(m[3]);
        ret.credential = this.#unquoteCredential(m[4]);
        ret.credentialType = 'password';
      }

      return ret;
    }) : [];
  }

  static #parseOffer(sdp) {
    const ret = {
      iceUfrag: '',
      icePwd: '',
      medias: [],
    };

    for (const line of sdp.split('\r\n')) {
      if (line.startsWith('m=')) {
        ret.medias.push(line.slice('m='.length));
      } else if (ret.iceUfrag === '' && line.startsWith('a=ice-ufrag:')) {
        ret.iceUfrag = line.slice('a=ice-ufrag:'.length);
      } else if (ret.icePwd === '' && line.startsWith('a=ice-pwd:')) {
        ret.icePwd = line.slice('a=ice-pwd:'.length);
      }
    }

    return ret;
  }

  static #reservePayloadType(payloadTypes) {
    // everything is valid between 30 and 127, except for interval between 64 and 95
    // https://chromium.googlesource.com/external/webrtc/+/refs/heads/master/call/payload_type.h#29
    for (let i = 30; i <= 127; i++) {
      if ((i <= 63 || i >= 96) && !payloadTypes.includes(i.toString())) {
        const pl = i.toString();
        payloadTypes.push(pl);
        return pl;
      }
    }
    throw Error('unable to find a free payload type');
  }

  static #enableStereoPcmau(payloadTypes, section) {
    const lines = section.split('\r\n');

    let payloadType = this.#reservePayloadType(payloadTypes);
    lines[0] += ` ${payloadType}`;
    lines.splice(lines.length - 1, 0, `a=rtpmap:${payloadType} PCMU/8000/2`);
    lines.splice(lines.length - 1, 0, `a=rtcp-fb:${payloadType} transport-cc`);

    payloadType = this.#reservePayloadType(payloadTypes);
    lines[0] += ` ${payloadType}`;
    lines.splice(lines.length - 1, 0, `a=rtpmap:${payloadType} PCMA/8000/2`);
    lines.splice(lines.length - 1, 0, `a=rtcp-fb:${payloadType} transport-cc`);

    return lines.join('\r\n');
  }

  static #enableMultichannelOpus(payloadTypes, section) {
    const lines = section.split('\r\n');

    let payloadType = this.#reservePayloadType(payloadTypes);
    lines[0] += ` ${payloadType}`;
    lines.splice(lines.length - 1, 0, `a=rtpmap:${payloadType} multiopus/48000/3`);
    lines.splice(lines.length - 1, 0, `a=fmtp:${payloadType} channel_mapping=0,2,1;num_streams=2;coupled_streams=1`);
    lines.splice(lines.length - 1, 0, `a=rtcp-fb:${payloadType} transport-cc`);

    payloadType = this.#reservePayloadType(payloadTypes);
    lines[0] += ` ${payloadType}`;
    lines.splice(lines.length - 1, 0, `a=rtpmap:${payloadType} multiopus/48000/4`);
    lines.splice(lines.length - 1, 0, `a=fmtp:${payloadType} channel_mapping=0,1,2,3;num_streams=2;coupled_streams=2`);
    lines.splice(lines.length - 1, 0, `a=rtcp-fb:${payloadType} transport-cc`);

    payloadType = this.#reservePayloadType(payloadTypes);
    lines[0] += ` ${payloadType}`;
    lines.splice(lines.length - 1, 0, `a=rtpmap:${payloadType} multiopus/48000/5`);
    lines.splice(lines.length - 1, 0, `a=fmtp:${payloadType} channel_mapping=0,4,1,2,3;num_streams=3;coupled_streams=2`);
    lines.splice(lines.length - 1, 0, `a=rtcp-fb:${payloadType} transport-cc`);

    payloadType = this.#reservePayloadType(payloadTypes);
    lines[0] += ` ${payloadType}`;
    lines.splice(lines.length - 1, 0, `a=rtpmap:${payloadType} multiopus/48000/6`);
    lines.splice(lines.length - 1, 0, `a=fmtp:${payloadType} channel_mapping=0,4,1,2,3,5;num_streams=4;coupled_streams=2`);
    lines.splice(lines.length - 1, 0, `a=rtcp-fb:${payloadType} transport-cc`);

    payloadType = this.#reservePayloadType(payloadTypes);
    lines[0] += ` ${payloadType}`;
    lines.splice(lines.length - 1, 0, `a=rtpmap:${payloadType} multiopus/48000/7`);
    lines.splice(lines.length - 1, 0, `a=fmtp:${payloadType} channel_mapping=0,4,1,2,3,5,6;num_streams=4;coupled_streams=4`);
    lines.splice(lines.length - 1, 0, `a=rtcp-fb:${payloadType} transport-cc`);

    payloadType = this.#reservePayloadType(payloadTypes);
    lines[0] += ` ${payloadType}`;
    lines.splice(lines.length - 1, 0, `a=rtpmap:${payloadType} multiopus/48000/8`);
    lines.splice(lines.length - 1, 0, `a=fmtp:${payloadType} channel_mapping=0,6,1,4,5,2,3,7;num_streams=5;coupled_streams=4`);
    lines.splice(lines.length - 1, 0, `a=rtcp-fb:${payloadType} transport-cc`);

    return lines.join('\r\n');
  }

  static #enableL16(payloadTypes, section) {
    const lines = section.split('\r\n');

    let payloadType = this.#reservePayloadType(payloadTypes);
    lines[0] += ` ${payloadType}`;
    lines.splice(lines.length - 1, 0, `a=rtpmap:${payloadType} L16/8000/2`);
    lines.splice(lines.length - 1, 0, `a=rtcp-fb:${payloadType} transport-cc`);

    payloadType = this.#reservePayloadType(payloadTypes);
    lines[0] += ` ${payloadType}`;
    lines.splice(lines.length - 1, 0, `a=rtpmap:${payloadType} L16/16000/2`);
    lines.splice(lines.length - 1, 0, `a=rtcp-fb:${payloadType} transport-cc`);

    payloadType = this.#reservePayloadType(payloadTypes);
    lines[0] += ` ${payloadType}`;
    lines.splice(lines.length - 1, 0, `a=rtpmap:${payloadType} L16/48000/2`);
    lines.splice(lines.length - 1, 0, `a=rtcp-fb:${payloadType} transport-cc`);

    return lines.join('\r\n');
  }

  static #enableStereoOpus(section) {
    let opusPayloadFormat = '';
    const lines = section.split('\r\n');

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('a=rtpmap:') && lines[i].toLowerCase().includes('opus/')) {
        opusPayloadFormat = lines[i].slice('a=rtpmap:'.length).split(' ')[0];
        break;
      }
    }

    if (opusPayloadFormat === '') {
      return section;
    }

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith(`a=fmtp:${opusPayloadFormat} `)) {
        if (!lines[i].includes('stereo')) {
          lines[i] += ';stereo=1';
        }
        if (!lines[i].includes('sprop-stereo')) {
          lines[i] += ';sprop-stereo=1';
        }
      }
    }

    return lines.join('\r\n');
  }

  static #editOffer(sdp, nonAdvertisedCodecs) {
    const sections = sdp.split('m=');

    const payloadTypes = sections.slice(1)
      .map((s) => s.split('\r\n')[0].split(' ').slice(3))
      .reduce((prev, cur) => [...prev, ...cur], []);

    for (let i = 1; i < sections.length; i++) {
      if (sections[i].startsWith('audio')) {
        sections[i] = this.#enableStereoOpus(sections[i]);

        if (nonAdvertisedCodecs.includes('pcma/8000/2')) {
          sections[i] = this.#enableStereoPcmau(payloadTypes, sections[i]);
        }
        if (nonAdvertisedCodecs.includes('multiopus/48000/6')) {
          sections[i] = this.#enableMultichannelOpus(payloadTypes, sections[i]);
        }
        if (nonAdvertisedCodecs.includes('L16/48000/2')) {
          sections[i] = this.#enableL16(payloadTypes, sections[i]);
        }

        break;
      }
    }

    return sections.join('m=');
  }

  static #generateSdpFragment(od, candidates) {
    const candidatesByMedia = {};
    for (const candidate of candidates) {
      const mid = candidate.sdpMLineIndex;
      if (candidatesByMedia[mid] === undefined) {
        candidatesByMedia[mid] = [];
      }
      candidatesByMedia[mid].push(candidate);
    }

    let frag = `a=ice-ufrag:${od.iceUfrag}\r\n`
      + `a=ice-pwd:${od.icePwd}\r\n`;

    let mid = 0;

    for (const media of od.medias) {
      if (candidatesByMedia[mid] !== undefined) {
        frag += `m=${media}\r\n`
          + `a=mid:${mid}\r\n`;

        for (const candidate of candidatesByMedia[mid]) {
          frag += `a=${candidate.candidate}\r\n`;
        }
      }
      mid++;
    }

    return frag;
  }

  #handleError(err) {
    if (this.state === 'running') {
      if (this.pc !== null) {
        this.pc.close();
        this.pc = null;
      }

      this.offerData = null;

      if (this.sessionUrl !== null) {
        fetch(this.sessionUrl, {
          method: 'DELETE',
        });
        this.sessionUrl = null;
      }

      this.queuedCandidates = [];
      this.state = 'restarting';

      this.restartTimeout = window.setTimeout(() => {
        this.restartTimeout = null;
        this.state = 'running';
        this.#start();
      }, this.retryPause);

      if (this.conf.onError !== undefined) {
        this.conf.onError(`${err}, retrying in some seconds`);
      }
    } else if (this.state === 'getting_codecs') {
      this.state = 'failed';

      if (this.conf.onError !== undefined) {
        this.conf.onError(err);
      }
    }
  }

  #getNonAdvertisedCodecs() {
    Promise.all([
      ['pcma/8000/2'],
      ['multiopus/48000/6', 'channel_mapping=0,4,1,2,3,5;num_streams=4;coupled_streams=2'],
      ['L16/48000/2'],
    ]
      .map((c) => MediaMTXWebRTCReader.#supportsNonAdvertisedCodec(c[0], c[1]).then((r) => ((r) ? c[0] : false))))
      .then((c) => c.filter((e) => e !== false))
      .then((codecs) => {
        if (this.state !== 'getting_codecs') {
          throw new Error('closed');
        }

        this.nonAdvertisedCodecs = codecs;
        this.state = 'running';
        this.#start();
      })
      .catch((err) => {
        this.#handleError(err);
      });
  }

  #start() {
    this.#requestICEServers()
      .then((iceServers) => this.#setupPeerConnection(iceServers))
      .then((offer) => this.#sendOffer(offer))
      .then((answer) => this.#setAnswer(answer))
      .catch((err) => {
        this.#handleError(err.toString());
      });
  }

  #requestICEServers() {
    return fetch(this.conf.url, {
      method: 'OPTIONS',
    })
      .then((res) => MediaMTXWebRTCReader.#linkToIceServers(res.headers.get('Link')));
  }

  #setupPeerConnection(iceServers) {
    if (this.state !== 'running') {
      throw new Error('closed');
    }

    this.pc = new RTCPeerConnection({
      iceServers,
      // https://webrtc.org/getting-started/unified-plan-transition-guide
      sdpSemantics: 'unified-plan',
    });

    const direction = 'recvonly';
    this.pc.addTransceiver('video', { direction });
    this.pc.addTransceiver('audio', { direction });

    this.pc.onicecandidate = (evt) => this.#onLocalCandidate(evt);
    this.pc.onconnectionstatechange = () => this.#onConnectionState();
    this.pc.ontrack = (evt) => this.#onTrack(evt);

    return this.pc.createOffer()
      .then((offer) => {
        offer.sdp = MediaMTXWebRTCReader.#editOffer(offer.sdp, this.nonAdvertisedCodecs);
        this.offerData = MediaMTXWebRTCReader.#parseOffer(offer.sdp);

        return this.pc.setLocalDescription(offer)
          .then(() => offer.sdp);
      });
  }

  #sendOffer(offer) {
    if (this.state !== 'running') {
      throw new Error('closed');
    }

    return fetch(this.conf.url, {
      method: 'POST',
      headers: {'Content-Type': 'application/sdp'},
      body: offer,
    })
      .then((res) => {
        switch (res.status) {
          case 201:
            break;
          case 404:
            throw new Error('stream not found');
          case 400:
            return res.json().then((e) => { throw new Error(e.error); });
          default:
            throw new Error(`bad status code ${res.status}`);
        }

        this.sessionUrl = new URL(res.headers.get('location'), this.conf.url).toString();

        return res.text();
      });
  }

  #setAnswer(answer) {
    if (this.state !== 'running') {
      throw new Error('closed');
    }

    return this.pc.setRemoteDescription(new RTCSessionDescription({
      type: 'answer',
      sdp: answer,
    }))
      .then(() => {
        if (this.state !== 'running') {
          return;
        }

        if (this.queuedCandidates.length !== 0) {
          this.#sendLocalCandidates(this.queuedCandidates);
          this.queuedCandidates = [];
        }
      });
  }

  #onLocalCandidate(evt) {
    if (this.state !== 'running') {
      return;
    }

    if (evt.candidate !== null) {
      if (this.sessionUrl === null) {
        this.queuedCandidates.push(evt.candidate);
      } else {
        this.#sendLocalCandidates([evt.candidate]);
      }
    }
  }

  #sendLocalCandidates(candidates) {
    fetch(this.sessionUrl, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/trickle-ice-sdpfrag',
        'If-Match': '*',
      },
      body: MediaMTXWebRTCReader.#generateSdpFragment(this.offerData, candidates),
    })
      .then((res) => {
        switch (res.status) {
          case 204:
            break;
          case 404:
            throw new Error('stream not found');
          default:
            throw new Error(`bad status code ${res.status}`);
        }
      })
      .catch((err) => {
        this.#handleError(err.toString());
      });
  }

  #onConnectionState() {
    if (this.state !== 'running') {
      return;
    }

    // "closed" can arrive before "failed" and without
    // the close() method being called at all.
    // It happens when the other peer sends a termination
    // message like a DTLS CloseNotify.
    if (this.pc.connectionState === 'failed'
      || this.pc.connectionState === 'closed'
    ) {
      this.#handleError('peer connection closed');
    }
  }

  #onTrack(evt) {
    if (this.conf.onTrack !== undefined) {
      this.conf.onTrack(evt);
    }
  }
}

window.MediaMTXWebRTCReader = MediaMTXWebRTCReader;
            � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � �   �           � � � � � � � �������������������������� � � � � �                           � � � � �                                                                                                                                 @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ 
             � "   ) 1 :    B I Q  Y a i  � � � � � � � � � � � � � � � � � � � � � � � � q  5 M � �  � =� � y y � =� � }� � � � � � � � � � � � � � � � � � � � � � � � � e � =� � �  } � � } }� � � =�  � � � � % ==�   U m� � � �}� �  � ��� ��=� � ��   �       � � � �-E]u� �� � =� � }� � =�  � � � � � � � � �  ���� ��� � � � � � � � � � � � � � � � � � � �  � � � � � � � � �       � =� �                          � � � � � �   �� 	�                           ��3�333333333�333333333333333333333333333333333� � % � @ @    "=@ @ @ @ : *U�U-�=�-�@ �@ m� ����������������@ ���������                      �            ������������ � � � � � � � � � � � � ���� �� }� ���  --                                � � � � � � � � � � � � � � � � �  3333333� � � � � � � � � � � � � � � � � � � � � � � � � � � @ � =� � }� � =� �  � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � @ ���������������@@@@@@       33333333333@





























333333333333333333333 

39AIQ












3333333@ 33333333 3333          



@ @3



















3333333333333333
















333@ @ @ 





@ @ @ @ @ 





@ @@@ @ @ @ @ @ 33333333























0333333330000;00 3333333Yaiqy���  33                             300@         @ @   @ @                       @        @  @ @ @     @ @ 3 0003333@ @ 00@ @ 00; @ @ @ @ @ @ @ @ 0@ @ @ @ ��@ �  33@ @                         3@ @ 330@       @ @ @ @   @ @                       @        @  �@  �@   @ @ 3@ 00033@ @ @ @ 33@ @ 33;@ @ @ 3@ @ @ @ @ @ @ ��� @ �@ @ @ @ @ @ @           33   3 @ @ @ @ @ @ @ @ @ @ 330@          @    @                       @        @   @      @ @ 3 00033333@ 330@ 00;@ @  @ @ @ @ @ @ @ @ @ @ @ @ @ @ @   33@ @             @ @ @ @ @ @ @  333333@ 300@         @ @   @ @                       @        @   @      @ @ 3 0303333@ @ 00@ @ 00;@ @ @ @ @ @ @ 330@ @ @ @ ��@    33@ @                   @ @ @ @ @ @ @ @ @ @ 3 @       @ @ @    @     @ @ @   @  @   @ @ @   @ @ @    @ @ @             @ @ @ @ 0030000@ 333@ 333;@ @ @ @ @ @ @ 33@    @ @  @ @   33@ @           @ @ @ @ @ @ @           300         @    @                        @           @      @ @ 3 0300000@ 300@ 003;@ @ @ @ @ @ @ 00@ @ @ @ @ @   @   33@ @           @   0@ @ @ @ @ @ @ @ @ @ @ @ 03333@ 000@ 000;  @ @ @ @    0          33@ @                           @   @  @      @                         @  @           3 �333333;33 @ @        @         !    )    1            9   @ @ @ @ 33A3IQYai3333303q33; 33     333333y3333@ 3333�3333�3333�3333�333333333333�333@                                                �� ��	� � !) Q 19� AI�  QY����aiq	 !yQ ���9AI���������� I������             �                                  ����q��	!�)1}�9AIQYaiqy������������ � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � �     -M  � � � � � � � � � � � � � � � � �       @ @ E�E�E�E�E�E�@ @         @ E�@ E�@ E�@ E�        E�E�E�E�E�E�E�E� � � � �  	 @ @ !)19AIQ!)19AIQYaiqy���Yaiqy�������������������  ���@  �E�E�e��~���	@  !����*2:   A@ @   E�E��@ JRZ   a    E�E�%	M�j*r@ @ y��@  �=�Vv@ 
 
 
 
 
 
 
 
 
 
 
 �  @@ �     �            @ @ @  @ @ @@@@@
    �� ��    � �        ���             �       
 �@@@�@ @ @ @ @ @@@@@@�@ @ ���	�"*2)�I ) 1 ���	�"*2@  �Q 	a� !)9� A@ @ @         9                       &�E f�i �	� � � � A )I  9Q� � �   Y�a � i � q�� ���@ !Q y��� �����	    ����       ������������	!	)�1=	9A	I]	��!!}	)�1�	9A	I�	��!           @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ I ) 1 ���	y����������
>
^
~
�
�
�
�
������	
			"	@ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ >^~����>^~����>^~����>^ �����	� � !)Q 9Q� � AI�� 	� � �����	� � !)Q 9Q� � AI�� 	� ��                                                     � A	�I	  }� � =� YAQ� �  �      � �Q	Y	� � � � � � � � � � � � � � � � � �        =� � 333� @ @ @ @ @        '5'U'u'�'�'�'�'(5(U(u(�(�(�(�()5)U)u)�)�)@ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ 
  a	                                       333300      %� �)�)*     U+u+�+�+�+�+�+�+,,,,5,5,5,U,u,u,�*�*u,u,�,�,u,u,�*�*u,u,U,U,�,�,�,�,@ �,-5-5-U-u-�-�-�-�-.5.U.U.u.�.�.�.�.u.�./�.u.5/U/u/�/�/-�,�/�/050U0u0�0�0�0�01@   51U1u1�1�1�1�1252U2u1u2�2�2                                �����2�2353        U3������������	u3�3�3�3�3�3454U4u4�4�4�4�4555U5u5�5�5�5�5656U6u6�6�6!�6 �6757U7u7�7�7�7�7858U8u8�8�8�8�8959U9u9�9�9�9�9:5:U:u:�:�:�:�:;5;U;u;�;��;�;�;<5<U<u<�#�<�<)19AIQYaiqy�����������������<	�<=-=E=]=u=u=]=�=��=�=�=�=>>5>M>e>}>�>�>�>�>�>�>�>�>?%?=?U?U?m?m?m?�?�?�?�?�?�?�?�?@-@-@-@��@	!)�@19A�@�@IQYA%AEAeA�Aaiqy��A����A�A�B%BEB�eB����B�B�B�B����C���%C��	EC!eC�C@ )19A@ IQYaiq�y���C�!�C�C�@ D������������	!)19AIQYaiqy���������%D� � � � � � � � � � � � � � � � � � � � � � �  3333 3333333333  � � � � � � � � � � � � � � ��33                                                                  � � � � � � �   � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � ��        � =� ED� � � � �    =� 	  � �   � � � � � � � � � � �q�! ��)eD� � � � � � � � �y}D}� � @ @ @ @ @ � @  @  � � @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ ��Q�  A�      e-eMeme�e�e�e�ef-fMfmf�f�f  �f �f  g-gMgmg�g�g�g�gh-h Mh mh  �h�h   �h�hi-iMimi�i�i�i�ij-jMjmj�j�j�j�jk-kMkmk�z�z{-{M{m{�{�{�{�{|-|M|m|�|	�|�|�|!)1}-}@ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ 9AIM}m}QQ@ @ @ @ @ @ @ @ @ @ @ @ Yaiqy@ @ @ @ @ �3��y��������������	!)@ 19AIQ@ Y@ ai@ qy@ ��������������������������������				!!!!))))111199AAIIQQYYaaiiiiqqqqyyyy������������������������@ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ ����������I����������		!!))11999AAAIIIIIQYaiqy����������������	!)1:BJRZbiqayAi����������������������!)19Yai��������1��	�QYa	qy���������	!)19AI!QYaiqy�����������	!)AIQY)qy������1��9��	Aa	���IAQYa!)Y�1	Aiqy����������������	!)1Y9AIQ����������������	!)1Y9AIQ!)1YQa�)19!)1��YY                  aiiqy���������������������		!!)19AAIQYaiiqy)199�AI@ @ @ @ @ @ @  @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ QYaiqy�������   �3�3�3�3�3�3�3�3�3�3�3�3�3�3�3�3��}@ �"���}�}@ @ @ @ @ @ @ 3333333333333333@ �}~��*2��-~M~m~-~�~�~�~�~�~�~-  ��Nn�������@ @ "����*2���~- 
   " * "@ 2 : B J @ @ @ @ �Q .�N�@ n�Y ��a ��i ΀q �y � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � � !!	!	!!!!!!!!!!!!!!!!!)!)!)!)!1!1!1!1!9!9!9!9!A!A!A!A!I!I!I!I!Q!Q!Q!Q!Y!Y!Y!Y!a!a!a!a!i!i!i!i!q!q!q!q!y!y!y!y!�!�!�!�!�!�!�!�!�!�!�!�!�!�!�!�!�!�!@ @ �@ ��! : B 
 �!*2 � a	�!�I ) 1 ���	�"" "* �J  �����	� � !)Q 9Q� � AI�� 	� ��2 ��!�r �����	� � !)Q 9Q� � AI�� 	� ���!��!�-�a	M�M�m�����́��-�M�m�����͂��-�M�m�����̓��-�M��m���M���̈́��-�M�m�������ͅͅ���M�-�M�-�m�M���������͆͆M�M���@ -�M�m���m���͇����-�-���M�m�����͈����������@ @ @ M�-�-�-�M�-�@ @ M�M�m�-�m�M�@ @ ������m�-�m�@ @ ͉�͉@ @ @ �!�!�!�"	"-�@ M�m���m���͊�@ @ @ @ @ @ @ @ @ @ @@@@ @ @ @                                     @ @ @ @ @ @ @ @ @ @ @  =�U�m�U���U�m�U�=�����@ ͋������=�M�]�M�}�M�]�M�=�����@ ��������=�M�]�@ }�M�@            @                @        @   @ @ @  ""�!")"@ 1"9"A"I"Q"Y"a"i"q"y"�"�"�"�"A�"�"�"�"�"���"�"��"%��"�"�"Q�"E�I	#	###!#)#1#9#@ A#I#Q#Y#a#i#q#e���@ @ @ @ @ 




	



	







33@ @ @ @ 



@ @ @ @ @ @ @ @ @ 








@ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ 

@ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ 3300@         @ @   @ @                       @        @   @      @ 33 0030000@ @ 00@ @ 008@ @  @ @ @ @ @ @ 0@ @ @ @ @      00@ @ 3333333@ @ @ 33333@ @ @ @ @ @ @ @ @ @ @        @ @  @ @         @   @                         000000@ 00@ @ 338;  �����	� � !)Q 9Q� � AI�� 	� � �����	� � !)Q 9Q� � AI�� 	� � �����	� � !)Q 9Q� � AI�� 	� � �����	@ � !)Q 9Q� � AI�� 	� � �����	� � !)Q 9Q� � AI�� 	� � �����	� � !)Q 9Q� � AI�� 	� � @ ��@ @ 	@ @ � @ @ )Q 9Q@ � AI�� 	� � ���@ �@ � � !)@ 9Q� � AI�� 	� � �����	� � !)Q 9Q� � AI�� 	� � �����	� � !)Q 9Q� � AI�� 	� � �@ ���	@ @ � !)Q 9Q@ � AI�� 	� @  �����	� � !)Q 9Q� � AI�� 	� � �@ ���	@ � !@ Q @ @ @ � AI�� 	� @  �����	� � !)Q 9Q� � AI�� 	� � �����	� � !)Q 9Q� � AI�� 	� � �����	� � !)Q 9Q� � AI�� 	� � �����	� � !)Q 9Q� � AI�� 	� � �����	� � !)Q 9Q� � AI�� 	� � �����	� � !)Q 9Q� � AI�� 	� � �����	� � !)Q 9Q� � AI�� 	� � �����	� � !)Q 9Q� � AI�� 	� � �����	� � !)Q 9Q� � AI�� 	� � �����	� � !)Q 9Q� � AI�� 	� � �����	� � !)Q 9Q� � AI�� 	� � �����	� � !)Q 9Q� � AI�� 	� � �����	� � !)Q 9Q� � AI�� 	� ��#�#@ @ �#����#$	$��$$!$)$1$9$���A$I$Q$��Y$ia$�#����#$	$��$$!$)$1$9$��A$A$I$Q$��Y$ii$�#�$����#����#$	$��$$!$)$1$9$���A$I$Q$��Y$ia$�#����#$	$��$$!$)$1$9$��A$A$I$Q$��Y$ii$�#�$����#����#$	$��$$!$)$1$9$���A$I$Q$��Y$ia$�#����#$	$��$$!$)$1$9$��A$A$I$Q$��Y$ii$�#�$����#����#$	$��$$!$)$1$9$���A$I$Q$��Y$ia$�#����#$	$��$$!$)$1$9$��A$A$I$Q$��Y$ii$�#�$����#����#$	$��$$!$)$1$9$���A$I$Q$��Y$ia$�#����#$	$��$$!$)$1$9$��A$A$I$Q$��Y$ii$�#�$���q$q$@ @ �I ) 1 ���	�I ) 1 ���	�I ) 1 ���	�I ) 1 ���	�I ) 1 ���	3333333@ 33333333333333333@ @ 3333333@ 33@ 33333@ @ @ @ @ y$�$��$��$�$�$�$�$�$�$��$�$���$�$�$�$�$%	%%%!%)%1%9%A%I%Q%y$�$��$��$�$�$�$�$�$��$��$�$�$�$�$%�	%Y%1%a%i%q%y%�%@ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ ��5�5���u�u���5�5���������5�5���u�u���5�5��᥌����





























� � � � @ �!	!� 1!�!a!i!q!y!!A!Q!!!Y!!!� � � � )!9!I!�%��%�%@ � � @ �!@ @ � @ �!a!i!q!y!!A!Q!!!Y!@ !� � � @ )!@ I!@ @ @ @ @ @ � @ @ @ @ � @ �!@ i!@ y!!A!@ !!Y!@ !@ @ � @ )!@ I!@ �@ �%@ � � @ �!@ @ � 1!�!a!@ q!y!!A!Q!!!Y!@ !� � � @ )!9!I!�%@ �%@ � � � � �!�!	!� 1!�!@ i!q!y!!A!Q!!!Y!!!� � � � )!9!I!@ @ @ @ @ � � � @ �!	!� 1!�!@ i!q!y!!A!Q!!!Y!!!� � � � )!9!I!@ @ @ @ @ �%�%�%�%�%�%�%�%�%�%     �%�%&
&&&"&*&2&:&B&J&R&Z&b&j&r&z&�&�&�&�&�&�&�&�&�&�� 9�&  �����	� � !)Q 9Q� � AI�� 	� ��&��&��&�&                          �&�&'                   ''!'@ @ @ @ @ @ @ @ @ @ @ @ @ )'1'9'A'I'Q'Y'a'i'q'y'�'�'�'�'�'�'�'�'�'�'�'�'�'�'�'�'(	(((!()(1(9(A(I(Q(Y(a(i(q(y(�(@ @ @ @ �(�(�(���()	)))!)))1)9)݌A)I)Q)Y)��a)i)�'�q)y)�)�)�)=��)�)�)�)�)q(�)�)�)�)�)�)�)�)*	***!*)*1*1*1*]�9*A*I*}�Q*Y*a*i*q*y*�*�*�*�*�*�*�*�*�*�*�*�*�*�*�*�*�*+	+++!+)+1+9+A+��I+Q+Y+Q'a+i+��ݍq+y+�+�+�+�+@ �+�+�+���+�+�+�+��+�+@ �+�+�+�+,	,=�,]�,!,),1,9,A,I,Q,Y,a,i,}�q,y,�,�,�,���,��ݎ�,�,�,�,����,�,�,�,�,�,�,�,�,-	-=�--!-)-!-1-9-A-I-Q-Y-a-i-q-y-�-�-�-�-]��-�-�-�-�-}��-�-�-�-�-�-�-.	...��!.).1.9.A.I.Q.Y.a.i.q.y.�.�.�.�.�.�.���.�.�.�.�.ݏ�.�.�.�.�./	///!/)/��1/9/A/I/Q/Y/�=�]�a/}�i/q/y/�/�/�/�/�/�/�/���/�/�/�/�/�/���/�/ݐ���/0	000!0)01090�A0=�I0@ Q0Y0a0]�i0q0}���y0�0�0�0�0�0�0�0�0�0�0�0�0���0ݑ�0���0�=�]��0�01}�����ݒ	1111!1)11191��A1I1Q1Y1�a1=�]�i1q1y1�1�1�1}�����@ �1ݓ�1�1�1���1�1�1�1�1��1�1�1�12	2=�]�2}�2��!2)212��ݔ92��A2�I2Q2Y2a2i2q2=�]�}����,y2�2�2�2�2�2�2�2�2�2�2���2�2�2�2�2�23	333!3)3ݕ���1393A3I3=�Q3]�Y3a3}���i3q3y3�3�3�3�3�3�3�3�3�3�3@ �3�3�3�3�3���34	444ݖ��!4)41494A4I4�Q4Y4a4i4=�]�q4y4�4}��4�4Mh���4�4�4���4�4�4�4�4�4�4ݗ�4�4�4��5	555m{�!5)515=�95]�A5A5I5}�Q5Y5a5i5q5y5�5���5�5�5�5�5�5���5ݘ����5�5�5�5�5�5�5�5=�@ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @ @  A A!A"A#A$A%A&A'A(A)A*A+A,A-A.A/A0A1A2A3A4A5A6A7A8A9A:A;A<A=A>A?A@AAABACADAEAFAGAHAIAJAKALAMANAOAPAQARASATAUAVAWAXAYAZA[A\A]A^A_A`AaAbAcAdAeAfAgAhAiAjAkAlAmAnAoApAqArAsAtAuAvAwAxAyAzA{A|A}A~B¢B£B¥B¦B¬B·BÆBæBðBøBĦBħBıBŋBœBƎBƐBƫBǀBǁBǂBȢBȷBɐBɑBɒBɓBɔBɕBɖBɗBɘBəBɛBɜBɞBɟBɠBɡBɢBɣBɤBɥBɦBɧBɨBɩBɪBɫBɬBɭBɮBɯBɰBɱBɲBɳBɴBɵBɶBɷBɸBɹBɺBɻBɽBɾBʀBʁBʂBʃBʄBʈBʉBʊBʋBʌBʍBʎBʏBʐBʑBʒBʕBʘBʙBʛBʜBʝBʟBʡBʢBʣBʤBʥBʦBʧBʨBʩBʪBʫBʹBːBˑBΑBΒBΓBΔBΕBΖBΗBΘBΙBΚBΛBΜBΝBΞBΟBΠBΡBΣBΤBΥBΦBΧBΨBΩBαBβBγBδBεBζBηBθBιBκBλBμBνBξBοBπBρBςBσBτBυBφBχBψBωBϜBϝBаBбBвBгBдBеBжBзBиBкBлBмBнBоBпBрBсBтBуBфBхBцBчBшBъBыBьBэBюBѕBіBјBџBґBҫBүBұBӏBәBөBאBבBגBדBהBכBלBםBעBרBתBءBاBبBةBتBثBجBحBخBدBذBرBزBسBشBصBضBطBظBعBغBفBقBكBلBمBنBهBوBىBيBٮBٯBٱBٹBٺBٻBپBٿBڀBڃBڄBچBڇBڈBڌBڍBڎBڑBژBڡBڤBڦBکBڭBگBڱBڳBںBڻBھBہBۅBۆBۇBۈBۉBۋBیBېBےC་CნCᄀCᄁCᄂCᄃCᄄCᄅCᄆCᄇCᄈCᄉCᄊCᄋCᄌCᄍCᄎCᄏCᄐCᄑCᄒCᄔCᄕCᄚCᄜCᄝCᄞCᄠCᄡCᄢCᄣCᄧCᄩCᄫCᄬCᄭCᄮCᄯCᄲCᄶCᅀCᅇCᅌCᅗCᅘCᅙCᅠCᆄCᆅCᆈCᆑCᆒCᆔCᆞCᆡCᇇCᇈCᇌCᇎCᇓCᇗCᇙCᇝCᇟCᇱCᇲCᴂCᴖCᴗCᴜCᴝCᴥCᵻCᶅCᶑC C C‐C–C—C₩C←C↑C→C↓C∂C∇C∑C−C│C■C○C⦅C⦆CⱱCⵡC、C。C〈C〉C《C》C「C」C『C』C【C】C〒C〔C〕C〖C〗CァCアCィCイCゥCウCェCエCォCオCカCキCクCケCコCサCシCスCセCソCタCチCッCツCテCトCナCニCヌCネCノCハCヒCフCヘCホCマCミCムCメCモCャCヤCュCユCョCヨCラCリCルCレCロCワCヰCヱCヲCンC・CーC㒞C㒹C㒻C㓟C㔕C㛮C㛼C㞁C㠯C㡢C㡼C㣇C㣣C㤜C㤺C㨮C㩬C㫤C㬈C㬙C㭉C㮝C㰘C㱎C㴳C㶖C㺬C㺸C㼛C㿼C䀈C䀘C䀹C䁆C䂖C䃣C䄯C䈂C䈧C䊠C䌁C䌴C䍙C䏕C䏙C䐋C䑫C䔫C䕝C䕡C䕫C䗗C䗹C䘵C䚾C䛇C䦕C䧦C䩮C䩶C䪲C䬳C䯎C䳎C䳭C䳸C䵖C一C丁C七C三C上C下C不C丙C並C丨C中C串C丶C丸C丹C丽C丿C乁C乙C九C亂C亅C了C二C五C亠C交C亮C人C什C仌C令C企C休C你C侀C來C例C侮C侻C便C倂C倫C偺C備C像C僚C僧C優C儿C兀C充C免C兔C兤C入C內C全C兩C八C六C具C冀C冂C再C冒C冕C冖C冗C写C冤C冫C冬C况C冷C凉C凌C凜C凞C几C凵C刀C刃C切C列C初C利C刺C刻C剆C前C割C剷C劉C力C劣C劳C労C勇C勉C勒C勞C勤C勵C勹C勺C包C匆C匕C北C匚C匸C医C匿C十C卄C卅C卉C卑C協C博C卜C卩C印C即C卵C卽C卿C厂C厶C參C又C及C双C叟C口C句C叫C可C叱C右C吆C合C名C吏C吝C吸C吹C呂C呈C周C咞C咢C咽C哶C唐C問C啓C啕C啣C善C喇C喙C喝C喫C喳C営C嗀C嗂C嗢C嘆C噑C器C噴C囗C四C囹C圖C圗C土C地C型C城C埴C堍C報C堲C塀C塚C塞C墨C墬C墳C壘C壟C士C壮C声C売C壷C夂C夆C夊C夕C多C夜C夢C大C天C奄C奈C契C奔C奢C女C姘C姬C娛C娧C婢C婦C媵C嬈C嬨C嬾C子C字C学C宀C宅C宗C寃C寘C寧C寮C寳C寸C寿C将C小C尢C尸C尿C屠C屢C層C履C屮C山C岍C峀C崙C嵃C嵐C嵫C嵮C嵼C嶲C嶺C巛C巡C巢C工C左C己C巽C巾C帨C帽C幩C干C年C幺C幼C广C度C庰C庳C庶C廉C廊C廒C廓C廙C廬C廴C廾C弄C弋C弓C弢C彐C当C彡C形C彩C彫C彳C律C後C得C徚C復C徭C心C忍C志C念C忹C怒C怜C恵C悁C悔C惇C惘C惡C愈C慄C慈C慌C慎C慠C慨C慺C憎C憐C憤C憯C憲C懞C懲C懶C戀C戈C成C戛C戮C戴C戶C手C打C扝C投C抱C拉C拏C拓C拔C拼C拾C指C挽C捐C捕C捨C捻C掃C掠C掩C揄C揅C揤C搜C搢C摒C摩C摷C摾C撚C撝C擄C支C攴C敏C敖C敬C數C文C斗C料C斤C新C方C旅C无C既C旣C日C易C映C晉C晴C暈C暑C暜C暴C曆C曰C更C書C最C月C有C朗C望C朡C木C李C杓C杖C杞C杻C枅C林C柳C柺C栗C栟C株C桒C梁C梅C梎C梨C椔C楂C榣C槪C樂C樓C檨C櫓C櫛C欄C欠C次C歔C止C正C歲C歷C歹C殟C殮C殳C殺C殻C毋C母C比C毛C氏C气C水C汎C汧C沈C沿C泌C泍C泥C注C洖C洛C洞C洴C派C流C浩C浪C海C浸C涅C淋C淚C淪C淹C渚C港C湮C満C溜C溺C滇C滋C滑C滛C漏C演C漢C漣C潮C濆C濫C濾C瀛C瀞C瀹C灊C火C灰C灷C災C炙C炭C烈C烙C無C煅C煉C煮C熜C燎C燐C爐C爛C爨C爪C爫C爵C父C爻C爿C片C牐C牙C牛C牢C特C犀C犕C犬C犯C狀C狼C猪C獵C獺C玄C率C玉C王C玥C玲C珞C理C琉C琢C瑇C瑜C瑩C瑱C璅C璉C璘C瓊C瓜C瓦C甆C甘C生C甤C用C田C甲C申C男C画C甾C留C略C異C疋C疒C痢C瘐C瘝C瘟C療C癩C癶C白C皮C皿C益C盛C監C盧C目C直C省C眞C真C着C睊C瞋C瞧C矛C矢C石C硎C硫C碌C碑C磊C磌C磻C礪C示C礼C社C祈C祉C祐C祖C祝C神C祥C祿C禁C禍C禎C福C禮C禸C禾C秊C秘C秫C稜C穀C穊C穏C穴C空C突C窱C立C竮C竹C笠C箏C節C篆C築C簾C籠C米C类C粒C精C糒C糖C糣C糧C糨C糸C紀C紐C索C累C終C絛C絣C綠C綾C緇C練C縂C縉C縷C繁C繅C缶C缾C网C署C罹C罺C羅C羊C羕C羚C羽C翺C老C者C而C耒C耳C聆C聠C聯C聰C聾C聿C肉C肋C肭C育C脃C脾C臘C臣C臨C自C臭C至C臼C舁C舄C舌C舘C舛C舟C艮C良C色C艸C艹C芋C芑C芝C花C芳C芽C若C苦C茝C茣C茶C荒C荓C荣C莭C莽C菉C菊C菌C菜C菧C華C菱C落C葉C著C蓮C蓱C蓳C蓼C蔖C蕤C藍C藺C蘆C蘒C蘭C蘿C虍C虐C虜C虧C虩C虫C蚈C蚩C蛢C蜎C蜨C蝫C蝹C螆C螺C蟡C蠁C蠟C血C行C衠C衣C裂C裏C裗C裞C裡C裸C裺C褐C襁C襤C襾C覆C見C視C角C解C言C誠C說C調C請C諒C論C諭C諸C諾C謁C謹C識C讀C變C谷C豆C豈C豕C豸C貝C財C販C貫C賁C賂C資C賈C賓C贈C贛C赤C走C起C足C趼C跋C路C跰C身C車C軔C輦C輪C輸C輻C轢C辛C辞C辰C辵C辶C連C逸C遊C適C遲C遼C邏C邑C邔C郎C郞C郱C都C鄑C鄛C酉C配C酪C醙C醴C釆C里C量C金C鈴C鈸C鉶C鉼C鋗C鋘C錄C鍊C鏹C鐕C長C門C開C閭C閷C阜C阮C陋C降C陵C陸C陼C隆C隣C隶C隷C隸C隹C雃C離C難C雨C零C雷C霣C露C靈C靑C靖C非C面C革C韋C韛C韠C韭C音C響C頁C項C頋C領C頩C頻C類C風C飛C食C飢C飯C飼C館C餩C首C香C馧C馬C駂C駱C駾C驪C骨C高C髟C鬒C鬥C鬯C鬲C鬼C魚C魯C鱀C鱗C鳥C鳽C鵧C鶴C鷺C鸞C鹵C鹿C麗C麟C麥C麻C黃C黍C黎C黑C黹C黽C黾C鼅C鼎C鼏C鼓C鼖C鼠C鼻C齃C齊C齒C龍C龎C龜C龟C龠CꙑCꚉCꜧCꝯCꞎCꬷCꭒCꭦCꭧD𝼄D𝼅D𝼆D𝼈D𝼊D𝼞D𠄢D𠔜D𠔥D𠕋D𠘺D𠠄D𠣞D𠨬D𠭣D𡓤D𡚨D𡛪D𡧈D𡬘D𡴋D𡷤D