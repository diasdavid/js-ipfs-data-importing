/* eslint-env mocha */
'use strict'

const importer = require('./../src').importer
const expect = require('chai').expect
const BlockService = require('ipfs-block-service')
const pull = require('pull-stream')
const mh = require('multihashes')
const IPLDResolver = require('ipld-resolver')
const loadFixture = require('aegir/fixtures')

function stringifyMh (files) {
  return files.map((file) => {
    file.multihash = mh.toB58String(file.multihash)
    return file
  })
}

const bigFile = loadFixture(__dirname, 'fixtures/1.2MiB.txt')
const smallFile = loadFixture(__dirname, 'fixtures/200Bytes.txt')

module.exports = (repo) => {
  describe('depth-first importer', () => {
    let ipldResolver

    const options = {
      strategy: 'depth-first'
    }

    before(() => {
      const bs = new BlockService(repo)
      ipldResolver = new IPLDResolver(bs)
    })

    it('bad input', (done) => {
      pull(
        pull.values([{
          path: '200Bytes.txt',
          content: 'banana'
        }]),
        importer(ipldResolver, options),
        pull.onEnd((err) => {
          expect(err).to.exist
          done()
        })
      )
    })

    it('small file (smaller than a chunk)', (done) => {
      pull(
        pull.values([{
          path: '200Bytes.txt',
          content: pull.values([smallFile])
        }]),
        importer(ipldResolver, options),
        pull.collect((err, files) => {
          expect(err).to.not.exist
          expect(stringifyMh(files)).to.be.eql([{
            name: '',
            leafSize: 200,
            path: '200Bytes.txt',
            multihash: 'QmQmZQxSKQppbsWfVzBvg59Cn3DKtsNVQ94bjAxg2h3Lb8',
            size: 211
          }])
          done()
        })
      )
    })

    it('small file as buffer (smaller than a chunk)', (done) => {
      pull(
        pull.values([{
          path: '200Bytes.txt',
          content: smallFile
        }]),
        importer(ipldResolver, options),
        pull.collect((err, files) => {
          expect(err).to.not.exist
          expect(stringifyMh(files)).to.be.eql([{
            name: '',
            leafSize: 200,
            path: '200Bytes.txt',
            multihash: 'QmQmZQxSKQppbsWfVzBvg59Cn3DKtsNVQ94bjAxg2h3Lb8',
            size: 211
          }])
          done()
        })
      )
    })

    it('small file (smaller than a chunk) inside a dir', (done) => {
      pull(
        pull.values([{
          path: 'foo/bar/200Bytes.txt',
          content: pull.values([smallFile])
        }]),
        importer(ipldResolver, options),
        pull.collect(collected)
      )

      function collected (err, files) {
        expect(err).to.not.exist
        expect(files.length).to.equal(3)
        stringifyMh(files).forEach((file) => {
          if (file.path === 'foo/bar/200Bytes.txt') {
            expect(file).to.be.eql({
              leafSize: 200,
              name: '',
              path: 'foo/bar/200Bytes.txt',
              multihash: 'QmQmZQxSKQppbsWfVzBvg59Cn3DKtsNVQ94bjAxg2h3Lb8',
              size: 211
            })
          }
          if (file.path === 'foo') {
            expect(file).to.be.eql({
              path: 'foo',
              multihash: 'QmQrb6KKWGo8w7zKfx2JksptY6wN7B2ysSBdKZr4xMU36d',
              size: 320
            })
          }
          if (file.path === 'foo/bar') {
            expect(file).to.be.eql({
              path: 'foo/bar',
              multihash: 'Qmf5BQbTUyUAvd6Ewct83GYGnE1F6btiC3acLhR8MDxgkD',
              size: 270
            })
          }
        })
        done()
      }
    })

    it('file bigger than a single chunk', (done) => {
      pull(
        pull.values([{
          path: '1.2MiB.txt',
          content: pull.values([bigFile])
        }]),
        importer(ipldResolver, options),
        pull.collect((err, files) => {
          expect(err).to.not.exist
          expect(stringifyMh(files)).to.be.eql([{
            leafSize: 1226240,
            path: '1.2MiB.txt',
            multihash: 'QmZfLDD7mnRWZzA12Yf343hA12kMKuo2my3wb67nHKk1UU',
            size: 1363479
          }])
          done()
        })
      )
    })

    it('file bigger than a single chunk inside a dir', (done) => {
      pull(
        pull.values([{
          path: 'foo-big/1.2MiB.txt',
          content: pull.values([bigFile])
        }]),
        importer(ipldResolver, options),
        pull.collect((err, files) => {
          expect(err).to.not.exist

          expect(stringifyMh(files)).to.be.eql([{
            path: 'foo-big/1.2MiB.txt',
            multihash: 'QmZfLDD7mnRWZzA12Yf343hA12kMKuo2my3wb67nHKk1UU',
            size: 1363479,
            leafSize: 1226240
          }, {
            path: 'foo-big',
            multihash: 'QmNNDMK9Faa5J6fc17SGQckV7JKWCtPaxSc2oRdcA36XHB',
            size: 1363537
          }])

          done()
        })
      )
    })

    it.skip('file (that chunk number exceeds max links)', (done) => {
      // TODO
    })

    it('empty directory', (done) => {
      pull(
        pull.values([{
          path: 'empty-dir'
        }]),
        importer(ipldResolver, options),
        pull.collect((err, files) => {
          expect(err).to.not.exist

          expect(stringifyMh(files)).to.be.eql([{
            path: 'empty-dir',
            multihash: 'QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn',
            size: 4
          }])

          done()
        })
      )
    })

    it('directory with files', (done) => {
      pull(
        pull.values([{
          path: 'pim/200Bytes.txt',
          content: pull.values([smallFile])
        }, {
          path: 'pim/1.2MiB.txt',
          content: pull.values([bigFile])
        }]),
        importer(ipldResolver, options),
        pull.collect((err, files) => {
          expect(err).to.not.exist

          expect(stringifyMh(files)).be.eql([{
            leafSize: 200,
            name: '',
            path: 'pim/200Bytes.txt',
            multihash: 'QmQmZQxSKQppbsWfVzBvg59Cn3DKtsNVQ94bjAxg2h3Lb8',
            size: 211
          }, {
            leafSize: 1226240,
            path: 'pim/1.2MiB.txt',
            multihash: 'QmZfLDD7mnRWZzA12Yf343hA12kMKuo2my3wb67nHKk1UU',
            size: 1363479
          }, {
            path: 'pim',
            multihash: 'QmXMBU8mb2mgk4LXwNHKNayth3LWzStPbt6DfYmyyuXNLt',
            size: 1363803
          }])

          done()
        })
      )
    })

    it('nested directory (2 levels deep)', (done) => {
      pull(
        pull.values([{
          path: 'pam/pum/200Bytes.txt',
          content: pull.values([smallFile])
        }, {
          path: 'pam/pum/1.2MiB.txt',
          content: pull.values([bigFile])
        }, {
          path: 'pam/1.2MiB.txt',
          content: pull.values([bigFile])
        }]),
        importer(ipldResolver, options),
        pull.collect((err, files) => {
          expect(err).to.not.exist

          // need to sort as due to parallel storage the order
          // can vary
          stringifyMh(files).forEach(eachFile)

          done()
        })
      )

      function eachFile (file) {
        // TODO: verify that we can export these files and that they match
        if (file.path === 'pam/pum/200Bytes.txt') {
          expect(file.multihash).to.be.eql('QmQmZQxSKQppbsWfVzBvg59Cn3DKtsNVQ94bjAxg2h3Lb8')
          expect(file.size).to.be.eql(211)
        }
        if (file.path === 'pam/pum/1.2MiB.txt') {
          expect(file.multihash).to.be.eql('QmZfLDD7mnRWZzA12Yf343hA12kMKuo2my3wb67nHKk1UU')
          expect(file.size).to.be.eql(1363479)
        }
        if (file.path === 'pam/pum') {
          expect(file.multihash).to.be.eql('QmXMBU8mb2mgk4LXwNHKNayth3LWzStPbt6DfYmyyuXNLt')
          expect(file.size).to.be.eql(1363803)
        }
        if (file.path === 'pam/1.2MiB.txt') {
          expect(file.multihash).to.be.eql('QmZfLDD7mnRWZzA12Yf343hA12kMKuo2my3wb67nHKk1UU')
          expect(file.size).to.be.eql(1363479)
        }
        if (file.path === 'pam') {
          expect(file.multihash).to.be.eql('QmYYfhRHJip3K7WnoJz3CU6bPtQN34mPWnAVvQhNUiESW5')
          expect(file.size).to.be.eql(2727387)
        }
      }
    })
  })
}
