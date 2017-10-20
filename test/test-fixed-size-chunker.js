/* eslint-env mocha */
'use strict'

const chunker = require('./../src/chunker/fixed-size')
const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect
const pull = require('pull-stream')
const loadFixture = require('aegir/fixtures')

const rawFile = loadFixture(__dirname, 'fixtures/1MiB.txt')

describe('chunker: fixed size', () => {
  it('chunks non flat buffers', (done) => {
    const b1 = Buffer.alloc(2 * 256)
    const b2 = Buffer.alloc(1 * 256)
    const b3 = Buffer.alloc(5 * 256)

    b1.fill('a')
    b2.fill('b')
    b3.fill('c')

    pull(
      pull.values([b1, b2, b3]),
      chunker(256),
      pull.collect((err, chunks) => {
        expect(err).to.not.exist()
        expect(chunks).to.have.length(8)
        chunks.forEach((chunk) => {
          expect(chunk).to.have.length(256)
        })
        done()
      })
    )
  })

  it('256 Bytes chunks', (done) => {
    pull(
      pull.infinite(() => Buffer.from('a')),
      pull.take(256 * 12),
      chunker(256),
      pull.collect((err, chunks) => {
        expect(err).to.not.exist()
        expect(chunks).to.have.length(12)
        chunks.forEach((chunk) => {
          expect(chunk).to.have.length(256)
        })
        done()
      })
    )
  })

  it('256 KiB chunks', (done) => {
    const KiB256 = 262144
    pull(
      pull.values(rawFile),
      chunker(KiB256),
      pull.collect((err, chunks) => {
        expect(err).to.not.exist()

        expect(chunks).to.have.length(4)
        chunks.forEach((chunk) => {
          expect(chunk).to.have.length(KiB256)
        })
        done()
      })
    )
  })

  it('256 KiB chunks of non scalar filesize', (done) => {
    const KiB256 = 262144
    let file = Buffer.concat([rawFile, Buffer.from('hello')])

    pull(
      pull.values(file),
      chunker(KiB256),
      pull.collect((err, chunks) => {
        expect(err).to.not.exist()

        expect(chunks).to.have.length(5)
        let counter = 0

        chunks.forEach((chunk) => {
          if (chunk.length < KiB256) {
            counter++
          } else {
            expect(chunk).to.have.length(KiB256)
          }
        })

        expect(counter).to.be.eql(1)
        done()
      })
    )
  })
})
