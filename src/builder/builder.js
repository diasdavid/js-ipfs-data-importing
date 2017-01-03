'use strict'

const extend = require('deep-extend')
const assert = require('assert')
const UnixFS = require('ipfs-unixfs')
const pull = require('pull-stream')
const parallel = require('async/parallel')
const waterfall = require('async/waterfall')
const dagPB = require('ipld-dag-pb')
const CID = require('cids')

const reduce = require('./reduce')

const DAGNode = dagPB.DAGNode

const defaultOptions = {
  chunkerOptions: {
    maxChunkSize: 262144
  }
}

module.exports = function (createChunker, ipldResolver, createReducer, _options) {
  const options = extend({}, defaultOptions, _options)

  return function (source, files) {
    return function (items, cb) {
      parallel(items.map((item) => (cb) => {
        if (!item.content) {
          // item is a directory
          return createAndStoreDir(item, (err, node) => {
            if (err) {
              return cb(err)
            }
            source.push(node)
            files.push(node)
            cb()
          })
        }

        // item is a file
        createAndStoreFile(item, (err, node) => {
          if (err) {
            return cb(err)
          }
          source.push(node)
          files.push(node)
          cb()
        })
      }), cb)
    }
  }

  function createAndStoreDir (item, callback) {
    // 1. create the empty dir dag node
    // 2. write it to the dag store

    const d = new UnixFS('directory')
    waterfall([
      (cb) => DAGNode.create(d.marshal(), cb),
      (node, cb) => {
        ipldResolver.put({
          node: node,
          cid: new CID(node.multihash)
        }, (err) => cb(err, node))
      }
    ], (err, node) => {
      if (err) {
        return callback(err)
      }
      callback(null, {
        path: item.path,
        multihash: node.multihash,
        size: node.size
      })
    })
  }

  function createAndStoreFile (file, callback) {
    if (Buffer.isBuffer(file.content)) {
      file.content = pull.values([file.content])
    }

    if (typeof file.content !== 'function') {
      return callback(new Error('invalid content'))
    }

    const reducer = createReducer(reduce(file, ipldResolver), options)

    pull(
      file.content,
      createChunker(options.chunkerOptions),
      pull.map(chunk => new Buffer(chunk)),
      pull.map(buffer => new UnixFS('file', buffer)),
      pull.asyncMap((fileNode, callback) => {
        DAGNode.create(fileNode.marshal(), (err, node) => {
          callback(err, { DAGNode: node, fileNode: fileNode })
        })
      }),
      pull.asyncMap((leaf, callback) => {
        ipldResolver.put(
          {
            node: leaf.DAGNode,
            cid: new CID(leaf.DAGNode.multihash)
          },
          err => callback(err, leaf)
        )
      }),
      pull.map((leaf) => {
        return {
          path: file.path,
          multihash: leaf.DAGNode.multihash,
          size: leaf.DAGNode.size,
          leafSize: leaf.fileNode.fileSize(),
          name: ''
        }
      }),
      reducer,
      pull.collect((err, roots) => {
        if (err) {
          callback(err)
        } else {
          assert.equal(roots.length, 1, 'should result in exactly one root')
          callback(null, roots[0])
        }
      })
    )
  }
}
